import { useEffect, useState, useCallback } from "react";
import {
  Cloud,
  Server,
  Check,
  X,
  Eye,
  EyeOff,
  RefreshCw,
  Loader2,
  AlertCircle,
  Zap,
  Brain,
  Database,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import { useSettingsStore } from "../../stores/settingsStore";
import { useAgentActivityStore } from "../../stores/agentActivityStore";
import type { AIProvider, ProviderTestResult, AIConfig } from "../../types/ai";
import { isLocalProvider, providerRequiresApiKey } from "../../types/ai";
import {
  findModelById,
  formatContextSize,
  getModelsForProvider,
  type ModelDefinition,
} from "../../types/models";
import * as aiLib from "../../lib/ai";
import {
  detectEmbeddingDimension,
  discoverAndIndexUrls,
  getEmbeddingModels,
  getEmbeddingStats,
  reindexEmbeddings,
  type EmbeddingModelInfo,
  type EmbeddingStats,
} from "../../lib/search";

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
 * AI Providers settings tab
 */
export function AIProviders() {
  const {
    aiConfig,
    isLoadingAIConfig,
    aiConfigError,
    loadAIConfig,
    updateProvider,
  } = useSettingsStore();

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [applyMessage, setApplyMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [embeddingModels, setEmbeddingModels] = useState<EmbeddingModelInfo[]>([]);

  // Load config on mount
  useEffect(() => {
    loadAIConfig();
  }, [loadAIConfig]);

  const handleApplyChanges = async () => {
    setIsApplying(true);
    setApplyMessage(null);
    try {
      await aiLib.applyAIConfig();
      setHasUnsavedChanges(false);
      setApplyMessage({
        type: "success",
        text: "Configuration applied successfully!",
      });
      setTimeout(() => setApplyMessage(null), 3000);
    } catch (error) {
      setApplyMessage({
        type: "error",
        text:
          error instanceof Error ? error.message : "Failed to apply configuration",
      });
    } finally {
      setIsApplying(false);
    }
  };

  const handleProviderUpdate = async (provider: AIProvider) => {
    await updateProvider(provider);
    setHasUnsavedChanges(true);
  };

  // Handle changing the default provider and model
  const handleDefaultModelChange = async (providerId: string, modelId: string) => {
    if (!aiConfig) return;
    // Find the provider to check if it's a local provider
    const provider = aiConfig.providers.find((p) => p.id === providerId);
    // For local providers, preserve the full model name (might contain "/" in the identifier)
    // For cloud providers, strip any known provider prefixes
    const modelName = provider && isLocalProvider(provider.type) ? modelId : stripKnownPrefix(modelId);
    const updatedProviders = aiConfig.providers.map((p) =>
      p.id === providerId ? { ...p, selectedModel: modelName } : p
    );
    const updated = {
      ...aiConfig,
      providers: updatedProviders,
      defaultProvider: providerId,
    };
    await aiLib.saveAIConfig(updated);
    await loadAIConfig();
    setHasUnsavedChanges(true);
  };

  // Handle changing the embedding provider and model
  const handleEmbeddingChange = async (provider: string, model: string, dimension: number) => {
    if (!aiConfig) return;
    const updated = {
      ...aiConfig,
      embedding: {
        ...aiConfig.embedding,
        provider,
        model,
        dimension,
      },
    };
    await aiLib.saveAIConfig(updated);
    await loadAIConfig();
    setHasUnsavedChanges(true);
  };

  if (isLoadingAIConfig) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2
          className="animate-spin"
          size={24}
          style={{ color: "var(--color-text-secondary)" }}
        />
        <span
          className="ml-2 text-sm"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Loading AI configuration...
        </span>
      </div>
    );
  }

  if (aiConfigError) {
    return (
      <div
        className="flex items-center gap-2 rounded-lg p-4"
        style={{
          backgroundColor: "var(--color-error-light)",
          color: "var(--color-error)",
        }}
      >
        <AlertCircle size={20} />
        <span>{aiConfigError}</span>
      </div>
    );
  }

  if (!aiConfig) {
    return null;
  }

  const cloudProviders = aiConfig.providers.filter(
    (p) => !isLocalProvider(p.type)
  );
  const localProviders = aiConfig.providers.filter((p) =>
    isLocalProvider(p.type)
  );

  return (
    <div className="space-y-6">
      {/* Default Model Selection */}
      <DefaultModelSelector
        providers={aiConfig.providers}
        defaultProvider={aiConfig.defaultProvider}
        onSelect={handleDefaultModelChange}
      />

      {/* Embedding Status Bar */}
      <EmbeddingStatusBar
        config={aiConfig}
        onAutoEmbedChange={async (enabled) => {
          const updated = {
            ...aiConfig,
            embedding: { ...aiConfig.embedding, autoEmbed: enabled },
          };
          await aiLib.saveAIConfig(updated);
          await loadAIConfig();
        }}
        onModelsLoaded={setEmbeddingModels}
      />

      {/* Apply Changes Banner */}
      {hasUnsavedChanges && (
        <div
          className="flex items-center justify-between rounded-lg p-3"
          style={{
            backgroundColor: "var(--color-warning-light)",
            border: "1px solid var(--color-warning)",
          }}
        >
          <div className="flex items-center gap-2">
            <Zap size={16} style={{ color: "var(--color-warning)" }} />
            <span
              className="text-sm font-medium"
              style={{ color: "var(--color-warning)" }}
            >
              Configuration changed. Click Apply to save.
            </span>
          </div>
          <button
            onClick={handleApplyChanges}
            disabled={isApplying}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
            style={{
              backgroundColor: "var(--color-accent)",
              color: "white",
            }}
          >
            {isApplying ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
            Apply Changes
          </button>
        </div>
      )}

      {/* Apply Message */}
      {applyMessage && (
        <div
          className="flex items-center gap-2 rounded-lg p-3 text-sm"
          style={{
            backgroundColor:
              applyMessage.type === "success"
                ? "var(--color-success-light)"
                : "var(--color-error-light)",
            color:
              applyMessage.type === "success"
                ? "var(--color-success)"
                : "var(--color-error)",
          }}
        >
          {applyMessage.type === "success" ? <Check size={16} /> : <X size={16} />}
          {applyMessage.text}
        </div>
      )}

      {/* Environment Variables Info */}
      <div
        className="rounded-lg p-3 text-xs"
        style={{
          backgroundColor: "var(--color-bg-secondary)",
          color: "var(--color-text-tertiary)",
        }}
      >
        <p
          className="mb-1 font-medium"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Environment Variables
        </p>
        <p>
          API keys can also be set via environment variables:{" "}
          <code
            className="rounded px-1"
            style={{ backgroundColor: "var(--color-bg-tertiary)" }}
          >
            OPENAI_API_KEY
          </code>
          ,{" "}
          <code
            className="rounded px-1"
            style={{ backgroundColor: "var(--color-bg-tertiary)" }}
          >
            ANTHROPIC_API_KEY
          </code>
          ,{" "}
          <code
            className="rounded px-1"
            style={{ backgroundColor: "var(--color-bg-tertiary)" }}
          >
            GOOGLE_API_KEY
          </code>
        </p>
      </div>

      {/* Cloud Providers */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <Cloud size={16} style={{ color: "var(--color-text-secondary)" }} />
          <h3
            className="text-sm font-medium"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Cloud Providers
          </h3>
        </div>
        <div className="space-y-3">
          {cloudProviders.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              onUpdate={handleProviderUpdate}
              embeddingProvider={aiConfig.embedding.provider}
              embeddingModel={aiConfig.embedding.model}
              onEmbeddingChange={handleEmbeddingChange}
              knownEmbeddingModels={embeddingModels}
            />
          ))}
        </div>
      </div>

      {/* Local Providers */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <Server size={16} style={{ color: "var(--color-text-secondary)" }} />
          <h3
            className="text-sm font-medium"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Local Models
          </h3>
        </div>
        <div className="space-y-3">
          {localProviders.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              onUpdate={handleProviderUpdate}
              isLocal
              embeddingProvider={aiConfig.embedding.provider}
              embeddingModel={aiConfig.embedding.model}
              onEmbeddingChange={handleEmbeddingChange}
              knownEmbeddingModels={embeddingModels}
            />
          ))}
        </div>
        <p
          className="mt-2 text-xs"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          Local models run on your machine. Make sure Ollama or LM Studio is
          running before enabling.
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// Default Model Selector Component
// ============================================================================

interface DefaultModelSelectorProps {
  providers: AIProvider[];
  defaultProvider: string | null;
  onSelect: (providerId: string, modelId: string) => Promise<void>;
}

function DefaultModelSelector({
  providers,
  defaultProvider,
  onSelect,
}: DefaultModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Get enabled providers only
  const enabledProviders = providers.filter((p) => p.isEnabled);

  // Get the current default model info
  const currentProvider = providers.find((p) => p.id === defaultProvider);
  const currentModelId =
    currentProvider?.selectedModel ?? currentProvider?.models[0];
  const currentModelDef = currentModelId ? findModelById(currentModelId) : null;

  const handleSelect = async (providerId: string, modelId: string) => {
    await onSelect(providerId, modelId);
    setIsOpen(false);
  };

  if (enabledProviders.length === 0) {
    return (
      <div
        className="rounded-lg border p-4"
        style={{
          backgroundColor: "var(--color-bg-secondary)",
          borderColor: "var(--color-border)",
        }}
      >
        <div className="flex items-center gap-2">
          <Sparkles
            size={16}
            style={{ color: "var(--color-text-tertiary)" }}
          />
          <h3
            className="text-sm font-medium"
            style={{ color: "var(--color-text-primary)" }}
          >
            Default Model
          </h3>
        </div>
        <p
          className="mt-2 text-xs"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          Enable a provider below to select a default AI model.
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-lg border p-4"
      style={{
        backgroundColor: "var(--color-bg-secondary)",
        borderColor: "var(--color-border)",
      }}
    >
      <div className="mb-3 flex items-center gap-2">
        <Sparkles size={16} style={{ color: "var(--color-accent)" }} />
        <h3
          className="text-sm font-medium"
          style={{ color: "var(--color-text-primary)" }}
        >
          Default Model
        </h3>
      </div>

      <p
        className="mb-3 text-xs"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        This model will be used for AI features like summarization, chat, and
        suggestions.
      </p>

      {/* Model Selector Button */}
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors"
          style={{
            backgroundColor: "var(--color-bg-primary)",
            borderColor: isOpen ? "var(--color-accent)" : "var(--color-border)",
          }}
        >
          <div className="flex items-center gap-2">
            {currentModelDef ? (
              <>
                {currentModelDef.supportsReasoning && (
                  <Brain size={14} style={{ color: "var(--color-accent)" }} />
                )}
                <span style={{ color: "var(--color-text-primary)" }}>
                  {currentModelDef.displayName}
                </span>
                <span
                  className="text-xs"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  {formatContextSize(currentModelDef.contextSize)} context
                </span>
                <span
                  className="rounded px-1.5 py-0.5 text-xs"
                  style={{
                    backgroundColor: "var(--color-bg-tertiary)",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  {currentProvider?.name}
                </span>
              </>
            ) : currentModelId ? (
              <span style={{ color: "var(--color-text-primary)" }}>
                {currentModelId}
              </span>
            ) : (
              <span style={{ color: "var(--color-text-tertiary)" }}>
                Select a model...
              </span>
            )}
          </div>
          <ChevronDown
            size={16}
            style={{
              color: "var(--color-text-tertiary)",
              transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s",
            }}
          />
        </button>

        {/* Dropdown */}
        {isOpen && (
          <div
            className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-lg border shadow-lg"
            style={{
              backgroundColor: "var(--color-bg-primary)",
              borderColor: "var(--color-border)",
            }}
          >
            {enabledProviders.map((provider) => {
              const curatedModels = getModelsForProvider(provider.type);
              const models =
                curatedModels.length > 0
                  ? curatedModels
                  : provider.models.map((id) => ({
                      id,
                      displayName: id,
                      provider: provider.type,
                      supportsReasoning: false,
                      contextSize: 0,
                    }));

              if (models.length === 0) return null;

              return (
                <div key={provider.id}>
                  <div
                    className="sticky top-0 px-3 py-2 text-xs font-semibold"
                    style={{
                      backgroundColor: "var(--color-bg-secondary)",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    {provider.name}
                  </div>
                  {models.map((model) => {
                    const isSelected =
                      provider.id === defaultProvider &&
                      model.id === currentModelId;
                    return (
                      <button
                        key={model.id}
                        onClick={() => handleSelect(provider.id, model.id)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-opacity-50"
                        style={{
                          backgroundColor: isSelected
                            ? "var(--color-accent-light)"
                            : "transparent",
                        }}
                      >
                        <div className="flex flex-1 items-center gap-2">
                          {model.supportsReasoning && (
                            <Brain
                              size={12}
                              style={{ color: "var(--color-accent)" }}
                            />
                          )}
                          <span
                            className="text-sm"
                            style={{ color: "var(--color-text-primary)" }}
                          >
                            {model.displayName}
                          </span>
                          {model.contextSize > 0 && (
                            <span
                              className="text-xs"
                              style={{ color: "var(--color-text-tertiary)" }}
                            >
                              {formatContextSize(model.contextSize)}
                            </span>
                          )}
                        </div>
                        {model.supportsReasoning && (
                          <span
                            className="rounded px-1.5 py-0.5 text-xs"
                            style={{
                              backgroundColor: "var(--color-accent-light)",
                              color: "var(--color-accent)",
                            }}
                          >
                            Reasoning
                          </span>
                        )}
                        {isSelected && (
                          <Check
                            size={14}
                            style={{ color: "var(--color-accent)" }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Legend */}
      <div
        className="mt-3 flex items-center gap-4 text-xs"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        <div className="flex items-center gap-1">
          <Brain size={10} style={{ color: "var(--color-accent)" }} />
          <span>Supports reasoning/thinking</span>
        </div>
        <div className="flex items-center gap-1">
          <span>128K, 200K, 1M = context window</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Provider Card Component
// ============================================================================

// Providers that support embeddings
const EMBEDDING_PROVIDERS = ["openai", "ollama", "lmstudio", "google"];

// Default embedding models for each provider (model name without provider prefix)
const DEFAULT_EMBEDDING_MODELS: Record<string, { model: string; dimension: number }> = {
  openai: { model: "text-embedding-3-small", dimension: 1536 },
  ollama: { model: "nomic-embed-text", dimension: 768 },
  lmstudio: { model: "text-embedding-nomic-embed-text-v1.5@q4_k_m", dimension: 768 },
  google: { model: "gemini-embedding-001", dimension: 768 },
};

interface ProviderCardProps {
  provider: AIProvider;
  onUpdate: (provider: AIProvider) => Promise<void>;
  isLocal?: boolean;
  /** Current embedding provider from config */
  embeddingProvider?: string;
  /** Current embedding model from config */
  embeddingModel?: string;
  /** Callback to change embedding provider and model */
  onEmbeddingChange?: (provider: string, model: string, dimension: number) => Promise<void>;
  /** Available known embedding models (for dimension lookup) */
  knownEmbeddingModels?: EmbeddingModelInfo[];
}

function ProviderCard({ 
  provider, 
  onUpdate, 
  isLocal,
  embeddingProvider,
  embeddingModel,
  onEmbeddingChange,
  knownEmbeddingModels = [],
}: ProviderCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKey, setApiKey] = useState(provider.apiKey ?? "");
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl ?? "");
  const [contextLength, setContextLength] = useState<string>(
    provider.contextLength?.toString() ?? ""
  );
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<ProviderTestResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDetectingDimension, setIsDetectingDimension] = useState(false);

  const requiresApiKey = providerRequiresApiKey(provider.type);

  const handleToggleEnabled = async () => {
    setIsSaving(true);
    try {
      await onUpdate({
        ...provider,
        isEnabled: !provider.isEnabled,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const parsedContextLength = contextLength ? parseInt(contextLength, 10) : undefined;
      await onUpdate({
        ...provider,
        apiKey: apiKey || undefined,
        baseUrl: baseUrl || undefined,
        contextLength: parsedContextLength && !isNaN(parsedContextLength) ? parsedContextLength : undefined,
      });
      setIsExpanded(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await aiLib.testProvider({
        ...provider,
        apiKey: apiKey || undefined,
        baseUrl: baseUrl || undefined,
      });
      setTestResult(result);

      if (result.success && result.models && result.models.length > 0) {
        await onUpdate({
          ...provider,
          apiKey: apiKey || undefined,
          baseUrl: baseUrl || undefined,
          models: result.models,
        });
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : "Test failed",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleDetectLocal = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const result =
        provider.type === "ollama"
          ? await aiLib.detectOllama(baseUrl || undefined)
          : await aiLib.detectLMStudio(baseUrl || undefined);
      setTestResult(result);

      if (result.success && result.models && result.models.length > 0) {
        await onUpdate({
          ...provider,
          baseUrl: baseUrl || undefined,
          models: result.models,
          isEnabled: true,
        });
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : "Detection failed",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSelectModel = async (modelId: string) => {
    // For local providers, preserve the full model name (might contain "/" in the identifier)
    // For cloud providers, strip any known provider prefixes
    const modelName = isLocal ? modelId : stripKnownPrefix(modelId);
    await onUpdate({ ...provider, selectedModel: modelName });
  };

  // Get curated models for cloud providers
  const curatedModels = getModelsForProvider(provider.type);
  const hasCuratedModels = curatedModels.length > 0;
  const displayModels = hasCuratedModels ? curatedModels : provider.models.map((id) => ({
    id,
    displayName: id,
    provider: provider.type,
    supportsReasoning: false,
    contextSize: 0,
  }));
  const selectedModel = provider.selectedModel ?? provider.models[0];

  // Embedding support
  const supportsEmbeddings = EMBEDDING_PROVIDERS.includes(provider.id);
  const isEmbeddingProvider = embeddingProvider === provider.id;
  
  // Get embedding models for this provider:
  // - For cloud providers (OpenAI): use known embedding models filtered by provider
  // - For local providers (Ollama, LM Studio): use detected models from provider.models
  const providerEmbeddingModels: EmbeddingModelInfo[] = isLocal
    ? provider.models.map((modelId) => {
        // For local providers, use detected models and look up dimension if known
        const knownModel = knownEmbeddingModels.find(
          (m) => m.id === modelId || m.id === `${provider.id}/${modelId}`
        );
        return {
          id: modelId,
          displayName: knownModel?.displayName ?? modelId,
          dimension: knownModel?.dimension ?? 0, // 0 means unknown, will auto-detect
          provider: provider.id,
          isLocal: true,
        };
      })
    : knownEmbeddingModels.filter((m) => m.provider === provider.id);

  const handleEmbeddingToggle = async () => {
    if (!isEmbeddingProvider && onEmbeddingChange) {
      const defaults = DEFAULT_EMBEDDING_MODELS[provider.id];
      if (defaults) {
        await onEmbeddingChange(provider.id, defaults.model, defaults.dimension);
      } else if (providerEmbeddingModels.length > 0) {
        // Use first available embedding model as fallback
        const firstModel = providerEmbeddingModels[0];
        let dimension = firstModel.dimension;
        
        // If dimension unknown, try to detect it
        if (dimension === 0) {
          setIsDetectingDimension(true);
          try {
            const fullModelId = `${provider.id}/${firstModel.id}`;
            const result = await detectEmbeddingDimension(fullModelId);
            dimension = result.dimension;
          } catch (err) {
            console.warn("Failed to detect dimension:", err);
            dimension = 768; // fallback
          } finally {
            setIsDetectingDimension(false);
          }
        }
        
        await onEmbeddingChange(provider.id, firstModel.id, dimension);
      }
    }
    // Note: No "disable" - user must enable another provider
  };

  const handleEmbeddingModelChange = async (modelId: string) => {
    if (!onEmbeddingChange) return;
    
    const modelInfo = providerEmbeddingModels.find((m) => m.id === modelId);
    let dimension = modelInfo?.dimension ?? 0;
    
    // If dimension is unknown (0), try to detect it
    if (dimension === 0) {
      setIsDetectingDimension(true);
      try {
        const fullModelId = `${provider.id}/${modelId}`;
        const result = await detectEmbeddingDimension(fullModelId);
        dimension = result.dimension;
      } catch (err) {
        console.warn("Failed to detect dimension:", err);
        // Fall back to a reasonable default
        dimension = 768;
      } finally {
        setIsDetectingDimension(false);
      }
    }
    
    await onEmbeddingChange(provider.id, modelId, dimension);
  };

  return (
    <div
      className="rounded-lg border transition-colors"
      style={{
        backgroundColor: "var(--color-bg-secondary)",
        borderColor: provider.isEnabled
          ? "var(--color-accent)"
          : "var(--color-border)",
      }}
    >
      {/* Header */}
      <div
        className="flex cursor-pointer items-center justify-between p-4"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div
            className="h-2.5 w-2.5 rounded-full"
            style={{
              backgroundColor: provider.isEnabled
                ? "var(--color-success)"
                : "var(--color-text-tertiary)",
            }}
          />
          <div>
            <h4
              className="font-medium"
              style={{ color: "var(--color-text-primary)" }}
            >
              {provider.name}
            </h4>
            {displayModels.length > 0 && (
              <p
                className="text-xs"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                {displayModels.length} model{displayModels.length !== 1 ? "s" : ""}{" "}
                available
              </p>
            )}
          </div>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            handleToggleEnabled();
          }}
          disabled={isSaving}
          className="relative h-6 w-11 rounded-full transition-colors"
          style={{
            backgroundColor: provider.isEnabled
              ? "var(--color-accent)"
              : "var(--color-bg-tertiary)",
          }}
        >
          <div
            className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform"
            style={{
              transform: provider.isEnabled
                ? "translateX(22px)"
                : "translateX(2px)",
            }}
          />
        </button>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div
          className="border-t px-4 pb-4 pt-3"
          style={{ borderColor: "var(--color-border)" }}
        >
          {/* API Key input (for cloud providers) */}
          {requiresApiKey && (
            <div className="mb-3">
              <label
                className="mb-1.5 block text-xs font-medium"
                style={{ color: "var(--color-text-secondary)" }}
              >
                API Key
              </label>
              <div className="relative">
                <input
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your API key"
                  className="w-full rounded-lg border px-3 py-2 pr-10 text-sm"
                  style={{
                    backgroundColor: "var(--color-bg-primary)",
                    borderColor: "var(--color-border)",
                    color: "var(--color-text-primary)",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          )}

          {/* Base URL input */}
          {(isLocal || provider.type === "custom") && (
            <div className="mb-3">
              <label
                className="mb-1.5 block text-xs font-medium"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Base URL
              </label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={
                  provider.type === "ollama"
                    ? "http://localhost:11434"
                    : provider.type === "lmstudio"
                      ? "http://localhost:1234/v1"
                      : "https://api.example.com/v1"
                }
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{
                  backgroundColor: "var(--color-bg-primary)",
                  borderColor: "var(--color-border)",
                  color: "var(--color-text-primary)",
                }}
              />
            </div>
          )}

          {/* Context Length input (for local providers) */}
          {isLocal && (
            <div className="mb-3">
              <label
                className="mb-1.5 block text-xs font-medium"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Context Length (tokens)
              </label>
              <input
                type="number"
                value={contextLength}
                onChange={(e) => setContextLength(e.target.value)}
                placeholder="32000"
                min="1024"
                max="1000000"
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{
                  backgroundColor: "var(--color-bg-primary)",
                  borderColor: "var(--color-border)",
                  color: "var(--color-text-primary)",
                }}
              />
              <p
                className="mt-1 text-xs"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                Max tokens for context window. Leave empty for default (32K).
              </p>
            </div>
          )}

          {/* Test result */}
          {testResult && (
            <div
              className="mb-3 flex items-center gap-2 rounded-lg p-2 text-sm"
              style={{
                backgroundColor: testResult.success
                  ? "var(--color-success-light)"
                  : "var(--color-error-light)",
                color: testResult.success
                  ? "var(--color-success)"
                  : "var(--color-error)",
              }}
            >
              {testResult.success ? <Check size={16} /> : <X size={16} />}
              <span>{testResult.message}</span>
            </div>
          )}

          {/* Actions */}
          <div className="mb-3 flex gap-2">
            {isLocal ? (
              <button
                onClick={handleDetectLocal}
                disabled={isTesting}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
                style={{
                  backgroundColor: "var(--color-bg-tertiary)",
                  color: "var(--color-text-primary)",
                }}
              >
                {isTesting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
                Detect Models
              </button>
            ) : (
              <button
                onClick={handleTest}
                disabled={isTesting || !apiKey}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50"
                style={{
                  backgroundColor: "var(--color-bg-tertiary)",
                  color: "var(--color-text-primary)",
                }}
              >
                {isTesting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
                Test Connection
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
              style={{
                backgroundColor: "var(--color-accent)",
                color: "white",
              }}
            >
              {isSaving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Check size={14} />
              )}
              Save
            </button>
          </div>

          {/* Model Selection */}
          {displayModels.length > 0 && (
            <ModelSelector
              models={displayModels}
              selectedModel={selectedModel}
              onSelect={handleSelectModel}
              isLocal={isLocal}
            />
          )}

          {/* Embedding Toggle */}
          {supportsEmbeddings && provider.isEnabled && (
            <div
              className="mt-3 rounded-lg border p-3"
              style={{
                backgroundColor: isEmbeddingProvider
                  ? "var(--color-accent-light)"
                  : "var(--color-bg-tertiary)",
                borderColor: isEmbeddingProvider
                  ? "var(--color-accent)"
                  : "var(--color-border)",
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isDetectingDimension ? (
                    <Loader2 size={14} className="animate-spin" style={{ color: "var(--color-accent)" }} />
                  ) : (
                    <Database size={14} style={{ color: isEmbeddingProvider ? "var(--color-accent)" : "var(--color-text-tertiary)" }} />
                  )}
                  <div>
                    <p
                      className="text-sm font-medium"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      Use for Embeddings
                    </p>
                    <p
                      className="text-xs"
                      style={{ color: "var(--color-text-tertiary)" }}
                    >
                      {isDetectingDimension ? "Detecting model dimension..." : "Semantic search will use this provider"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleEmbeddingToggle}
                  disabled={isEmbeddingProvider || isDetectingDimension}
                  className="relative h-6 w-11 rounded-full transition-colors"
                  style={{
                    backgroundColor: isEmbeddingProvider
                      ? "var(--color-accent)"
                      : "var(--color-bg-tertiary)",
                    opacity: isEmbeddingProvider || isDetectingDimension ? 1 : 0.8,
                    cursor: isEmbeddingProvider || isDetectingDimension ? "default" : "pointer",
                  }}
                >
                  <div
                    className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform"
                    style={{
                      transform: isEmbeddingProvider
                        ? "translateX(22px)"
                        : "translateX(2px)",
                    }}
                  />
                </button>
              </div>

              {/* Embedding Model Selector */}
              {isEmbeddingProvider && providerEmbeddingModels.length > 0 && (
                <div className="mt-3">
                  <label
                    className="mb-1 block text-xs font-medium"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    Embedding Model
                  </label>
                  <select
                    value={embeddingModel}
                    onChange={(e) => handleEmbeddingModelChange(e.target.value)}
                    disabled={isDetectingDimension}
                    className="w-full rounded border px-2 py-1.5 text-sm disabled:opacity-50"
                    style={{
                      backgroundColor: "var(--color-bg-primary)",
                      borderColor: "var(--color-border)",
                      color: "var(--color-text-primary)",
                    }}
                  >
                    {providerEmbeddingModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.displayName} {m.dimension > 0 ? `(${m.dimension}d)` : "(auto-detect)"}
                      </option>
                    ))}
                  </select>
                  {isDetectingDimension && (
                    <p
                      className="mt-1 flex items-center gap-1 text-xs"
                      style={{ color: "var(--color-accent)" }}
                    >
                      <Loader2 size={10} className="animate-spin" />
                      Detecting dimension...
                    </p>
                  )}
                  {!isDetectingDimension && providerEmbeddingModels.find((m) => m.id === embeddingModel)?.dimension === 0 && (
                    <p
                      className="mt-1 text-xs"
                      style={{ color: "var(--color-text-tertiary)" }}
                    >
                      Dimension will be detected on first use
                    </p>
                  )}
                </div>
              )}
              {isEmbeddingProvider && providerEmbeddingModels.length === 0 && (
                <div className="mt-3">
                  <p
                    className="text-xs"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    Click &quot;Detect Models&quot; to find available embedding models
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Model Selector Component
// ============================================================================

interface ModelSelectorProps {
  models: Array<ModelDefinition | { id: string; displayName: string; supportsReasoning: boolean; contextSize: number }>;
  selectedModel: string | undefined;
  onSelect: (modelId: string) => Promise<void>;
  isLocal?: boolean;
}

function ModelSelector({ models, selectedModel, onSelect, isLocal }: ModelSelectorProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const selectedModelDef = selectedModel ? findModelById(selectedModel) : null;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p
          className="text-xs font-medium"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {isLocal ? "Detected Models" : "Available Models"}
        </p>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-xs"
          style={{ color: "var(--color-accent)" }}
        >
          {isExpanded ? "Show less" : `Show all (${models.length})`}
        </button>
      </div>

      {/* Selected model display */}
      {selectedModel && (
        <div
          className="mb-2 flex items-center gap-2 rounded-lg border p-2"
          style={{
            backgroundColor: "var(--color-bg-tertiary)",
            borderColor: "var(--color-accent)",
          }}
        >
          <Check size={12} style={{ color: "var(--color-accent)" }} />
          <span
            className="text-xs font-medium"
            style={{ color: "var(--color-text-primary)" }}
          >
            Selected:
          </span>
          {selectedModelDef ? (
            <>
              {selectedModelDef.supportsReasoning && (
                <Brain size={12} style={{ color: "var(--color-accent)" }} />
              )}
              <span
                className="text-sm"
                style={{ color: "var(--color-text-primary)" }}
              >
                {selectedModelDef.displayName}
              </span>
              <span
                className="text-xs"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                {formatContextSize(selectedModelDef.contextSize)}
              </span>
              {selectedModelDef.supportsReasoning && (
                <span
                  className="rounded px-1 py-0.5 text-xs"
                  style={{
                    backgroundColor: "var(--color-accent-light)",
                    color: "var(--color-accent)",
                  }}
                >
                  Reasoning
                </span>
              )}
            </>
          ) : (
            <span
              className="text-sm"
              style={{ color: "var(--color-text-primary)" }}
            >
              {selectedModel}
            </span>
          )}
        </div>
      )}

      {/* Model grid */}
      <div
        className={`grid gap-1.5 ${isExpanded ? "grid-cols-1" : "grid-cols-2"}`}
      >
        {(isExpanded ? models : models.slice(0, 4)).map((model) => {
          const isSelected = model.id === selectedModel;
          return (
            <button
              key={model.id}
              onClick={() => onSelect(model.id)}
              className={`flex items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs transition-colors ${
                isExpanded ? "justify-between" : ""
              }`}
              style={{
                backgroundColor: isSelected
                  ? "var(--color-accent-light)"
                  : "var(--color-bg-tertiary)",
                color: isSelected
                  ? "var(--color-accent)"
                  : "var(--color-text-secondary)",
              }}
            >
              <div className="flex items-center gap-1.5">
                {model.supportsReasoning && <Brain size={10} />}
                <span className={isSelected ? "font-medium" : ""}>
                  {model.displayName}
                </span>
                {model.contextSize > 0 && (
                  <span className="opacity-60" style={{ fontSize: "9px" }}>
                    {formatContextSize(model.contextSize)}
                  </span>
                )}
              </div>
              {isExpanded && model.supportsReasoning && (
                <span
                  className="rounded px-1 py-0.5"
                  style={{
                    backgroundColor: "var(--color-accent-light)",
                    color: "var(--color-accent)",
                    fontSize: "9px",
                  }}
                >
                  Reasoning
                </span>
              )}
              {isSelected && <Check size={10} />}
            </button>
          );
        })}
      </div>

      {!isExpanded && models.length > 4 && (
        <p
          className="mt-1.5 text-xs"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          +{models.length - 4} more models
        </p>
      )}
    </div>
  );
}

// ============================================================================
// Embedding Status Bar Component
// ============================================================================

interface EmbeddingStatusBarProps {
  config: AIConfig;
  onAutoEmbedChange: (enabled: boolean) => Promise<void>;
  onModelsLoaded?: (models: EmbeddingModelInfo[]) => void;
}

function EmbeddingStatusBar({ config, onAutoEmbedChange, onModelsLoaded }: EmbeddingStatusBarProps) {
  const [stats, setStats] = useState<EmbeddingStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isReindexing, setIsReindexing] = useState(false);
  const [reindexResult, setReindexResult] = useState<{ message: string; isError: boolean } | null>(null);
  const { queueTask } = useAgentActivityStore();

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [modelsData, statsData] = await Promise.all([
        getEmbeddingModels(),
        getEmbeddingStats(),
      ]);
      setStats(statsData);
      onModelsLoaded?.(modelsData);
    } catch (err) {
      console.error("Failed to load embedding data:", err);
    } finally {
      setIsLoading(false);
    }
  }, [onModelsLoaded]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleReindex = async () => {
    setIsReindexing(true);
    setReindexResult(null);
    
    const agentId = `reindex-${Date.now()}`;
    
    try {
      // Queue the reindex operation as a background task
      await queueTask(
        {
          id: agentId,
          type: "reindex",
          description: "Discovering URLs and re-indexing embeddings",
        },
        async () => {
          // First, discover and index any URLs in notes that aren't already tracked
          const discoverResult = await discoverAndIndexUrls();
          console.log(`[Reindex] Discovered ${discoverResult.discoveredCount} new URLs, ${discoverResult.existingCount} already existed`);
          
          // Wait a moment for any newly discovered URLs to be indexed
          if (discoverResult.discoveredCount > 0) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
          
          // Now reindex all embeddings
          const result = await reindexEmbeddings();
          
          if (result.errors.length > 0) {
            setReindexResult({
              message: `Notes: ${result.embeddedCount}/${result.totalNotes}, URLs: ${result.urlEmbeddedCount}/${result.totalUrls}. Error: ${result.errors[0]}`,
              isError: true,
            });
          } else if (result.embeddedCount === 0 && result.totalNotes > 0) {
            setReindexResult({
              message: "No notes embedded. Enable embeddings for a provider below.",
              isError: true,
            });
          } else {
            const urlPart = result.totalUrls > 0 
              ? ` and ${result.urlEmbeddedCount} URL${result.urlEmbeddedCount !== 1 ? "s" : ""}`
              : "";
            const discoverPart = discoverResult.discoveredCount > 0
              ? ` (${discoverResult.discoveredCount} new URLs found)`
              : "";
            setReindexResult({
              message: `Successfully embedded ${result.embeddedCount} note${result.embeddedCount !== 1 ? "s" : ""}${urlPart}${discoverPart}`,
              isError: false,
            });
          }
          await loadData();
        }
      );
    } catch (err) {
      console.error("Failed to reindex:", err);
      setReindexResult({ message: `Error: ${String(err)}`, isError: true });
    } finally {
      setIsReindexing(false);
    }
  };

  // Get provider display name
  const providerDisplayNames: Record<string, string> = {
    openai: "OpenAI",
    ollama: "Ollama",
    lmstudio: "LM Studio",
  };
  const providerName = providerDisplayNames[config.embedding.provider] ?? config.embedding.provider;

  if (isLoading) {
    return (
      <div
        className="flex items-center gap-2 rounded-lg border p-3"
        style={{
          backgroundColor: "var(--color-bg-secondary)",
          borderColor: "var(--color-border)",
        }}
      >
        <Loader2 size={14} className="animate-spin" style={{ color: "var(--color-text-tertiary)" }} />
        <span className="text-sm" style={{ color: "var(--color-text-tertiary)" }}>
          Loading embedding status...
        </span>
      </div>
    );
  }

  return (
    <div
      className="rounded-lg border p-3"
      style={{
        backgroundColor: "var(--color-bg-secondary)",
        borderColor: "var(--color-border)",
      }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Database size={16} style={{ color: "var(--color-accent)" }} />
          <div>
            <div className="flex items-center gap-2">
              <span
                className="text-sm font-medium"
                style={{ color: "var(--color-text-primary)" }}
              >
                Semantic Search
              </span>
              <span
                className="rounded px-1.5 py-0.5 text-xs"
                style={{
                  backgroundColor: "var(--color-accent-light)",
                  color: "var(--color-accent)",
                }}
              >
                {providerName}
              </span>
            </div>
            {stats && (
              <p
                className="text-xs"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                {stats.embeddedNotes} embedded, {stats.pendingNotes} pending of {stats.totalNotes} notes
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Auto-embed toggle */}
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>
              Auto-embed
            </span>
            <button
              onClick={() => onAutoEmbedChange(!config.embedding.autoEmbed)}
              className="relative h-5 w-9 rounded-full transition-colors"
              style={{
                backgroundColor: config.embedding.autoEmbed
                  ? "var(--color-accent)"
                  : "var(--color-bg-tertiary)",
              }}
            >
              <div
                className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform"
                style={{
                  transform: config.embedding.autoEmbed
                    ? "translateX(18px)"
                    : "translateX(2px)",
                }}
              />
            </button>
          </div>

          {/* Re-index button */}
          <button
            onClick={handleReindex}
            disabled={isReindexing}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors"
            style={{
              backgroundColor: "var(--color-bg-tertiary)",
              color: "var(--color-text-primary)",
            }}
          >
            {isReindexing ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <RefreshCw size={12} />
            )}
            Re-index
          </button>
        </div>
      </div>

      {/* Result message */}
      {reindexResult && (
        <p
          className="mt-2 text-xs"
          style={{
            color: reindexResult.isError
              ? "var(--color-error, #ef4444)"
              : "var(--color-success, #22c55e)",
          }}
        >
          {reindexResult.message}
        </p>
      )}

      {/* Help text */}
      <p
        className="mt-2 text-xs"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        Enable &quot;Use for Embeddings&quot; on a provider below to change embedding source.
      </p>
    </div>
  );
}

