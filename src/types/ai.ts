/**
 * AI provider types
 */

/** Type of AI provider */
export type ProviderType =
  | "openai"
  | "anthropic"
  | "google"
  | "ollama"
  | "lmstudio"
  | "vllm"
  | "custom";

/** Configuration for a single AI provider */
export interface AIProvider {
  /** Unique identifier for this provider config */
  id: string;
  /** Display name */
  name: string;
  /** Provider type */
  type: ProviderType;
  /** API key (for cloud providers) */
  apiKey?: string;
  /** Base URL for the provider API */
  baseUrl?: string;
  /** Whether this provider is enabled */
  isEnabled: boolean;
  /** List of available models for this provider */
  models: string[];
  /** Currently selected model for this provider */
  selectedModel?: string;
  /** Context window size in tokens (optional, uses provider defaults if not set) */
  contextLength?: number;
}

/** Default context lengths by provider type (in tokens) */
export const DEFAULT_CONTEXT_LENGTHS: Record<ProviderType, number> = {
  openai: 200_000,
  anthropic: 200_000,
  google: 1_000_000,
  ollama: 32_000,
  lmstudio: 32_000,
  vllm: 32_000,
  custom: 32_000,
};

/** Get the effective context length for a provider */
export function getEffectiveContextLength(provider: AIProvider): number {
  return provider.contextLength ?? DEFAULT_CONTEXT_LENGTHS[provider.type as ProviderType] ?? 32_000;
}

/** Configuration for embedding generation */
export interface EmbeddingConfig {
  /** The provider ID to use for embeddings (e.g., "ollama", "openai", "lmstudio") */
  provider: string;
  /** The embedding model to use (e.g., "nomic-embed-text" for ollama) */
  model: string;
  /** Dimension of the embedding vector */
  dimension: number;
  /** Whether to automatically embed notes on create/update */
  autoEmbed: boolean;
}

/** Helper to get the full model ID for API calls (provider/model format) */
export function getFullEmbeddingModelId(config: EmbeddingConfig): string {
  return `${config.provider}/${config.model}`;
}

/** Complete AI configuration */
export interface AIConfig {
  /** List of configured providers */
  providers: AIProvider[];
  /** ID of the default provider to use */
  defaultProvider: string | null;
  /** Embedding configuration */
  embedding: EmbeddingConfig;
}

/** Result of testing a provider connection */
export interface ProviderTestResult {
  success: boolean;
  message: string;
  models?: string[];
}

/** Result of local model detection */
export interface LocalModelsResult {
  ollama: ProviderTestResult;
  lmstudio: ProviderTestResult;
}

/** Information about a provider type */
export interface ProviderInfo {
  name: string;
  requiresApiKey: boolean;
  defaultBaseUrl: string | null;
  description: string;
}

/** Input for updating a provider */
export type UpdateProviderInput = Partial<Omit<AIProvider, "id">> & {
  id: string;
};

/** Default configuration for each provider type */
export const PROVIDER_DEFAULTS: Record<
  ProviderType,
  { name: string; requiresApiKey: boolean; defaultBaseUrl?: string }
> = {
  openai: { name: "OpenAI", requiresApiKey: true },
  anthropic: { name: "Anthropic", requiresApiKey: true },
  google: { name: "Google", requiresApiKey: true },
  ollama: {
    name: "Ollama",
    requiresApiKey: false,
    defaultBaseUrl: "http://localhost:11434",
  },
  lmstudio: {
    name: "LM Studio",
    requiresApiKey: false,
    defaultBaseUrl: "http://localhost:1234/v1",
  },
  vllm: {
    name: "VLLM",
    requiresApiKey: false,
    defaultBaseUrl: "http://localhost:8000",
  },
  custom: { name: "Custom", requiresApiKey: true },
};

/** Get display name for provider type */
export function getProviderDisplayName(type: ProviderType): string {
  return PROVIDER_DEFAULTS[type]?.name ?? type;
}

/** Check if provider type requires API key */
export function providerRequiresApiKey(type: ProviderType): boolean {
  return PROVIDER_DEFAULTS[type]?.requiresApiKey ?? true;
}

/** Check if provider type is a local provider */
export function isLocalProvider(type: ProviderType): boolean {
  return type === "ollama" || type === "lmstudio" || type === "vllm";
}
