/**
 * Curated model definitions with context sizes and reasoning support
 */

import type { ProviderType } from "./ai";

/** Model definition with metadata */
export interface ModelDefinition {
  /** Model ID used in API calls */
  id: string;
  /** Display name for UI */
  displayName: string;
  /** Provider type */
  provider: ProviderType;
  /** Whether the model supports reasoning/thinking (extended thinking, reasoning_effort) */
  supportsReasoning: boolean;
  /** Context window size in tokens */
  contextSize: number;
}

/** Reasoning effort levels for OpenAI models */
export type ReasoningEffort = "low" | "medium" | "high";

/** Thinking budget configuration for Anthropic models */
export interface ThinkingConfig {
  /** Enable extended thinking */
  enabled: boolean;
  /** Max tokens for thinking (budget) */
  budgetTokens?: number;
}

/**
 * Curated models for cloud providers
 */
export const CURATED_MODELS = {
  /** OpenAI models with reasoning effort support info and context sizes */
  openai: [
    // GPT-5 series (with reasoning) - 1M context
    { id: "gpt-5.1", displayName: "GPT-5.1", provider: "openai" as const, supportsReasoning: true, contextSize: 1_000_000 },
    { id: "gpt-5", displayName: "GPT-5", provider: "openai" as const, supportsReasoning: true, contextSize: 1_000_000 },
    { id: "gpt-5-mini", displayName: "GPT-5 Mini", provider: "openai" as const, supportsReasoning: true, contextSize: 1_000_000 },
    { id: "gpt-5-nano", displayName: "GPT-5 Nano", provider: "openai" as const, supportsReasoning: true, contextSize: 1_000_000 },

    // O-series reasoning models - 200K context
    { id: "o4-mini", displayName: "o4-mini", provider: "openai" as const, supportsReasoning: true, contextSize: 200_000 },
    { id: "o3", displayName: "o3", provider: "openai" as const, supportsReasoning: true, contextSize: 200_000 },
    { id: "o3-mini", displayName: "o3-mini", provider: "openai" as const, supportsReasoning: true, contextSize: 200_000 },
    { id: "o1", displayName: "o1", provider: "openai" as const, supportsReasoning: true, contextSize: 200_000 },
    { id: "o1-mini", displayName: "o1-mini", provider: "openai" as const, supportsReasoning: true, contextSize: 128_000 },
    { id: "o1-preview", displayName: "o1-preview", provider: "openai" as const, supportsReasoning: true, contextSize: 128_000 },

    // GPT-4.1 series (no reasoning) - 1M context
    { id: "gpt-4.1", displayName: "GPT-4.1", provider: "openai" as const, supportsReasoning: false, contextSize: 1_000_000 },
    { id: "gpt-4.1-mini", displayName: "GPT-4.1 Mini", provider: "openai" as const, supportsReasoning: false, contextSize: 1_000_000 },
    { id: "gpt-4.1-nano", displayName: "GPT-4.1 Nano", provider: "openai" as const, supportsReasoning: false, contextSize: 1_000_000 },

    // GPT-4o series (no reasoning) - 128K context
    { id: "gpt-4o", displayName: "GPT-4o", provider: "openai" as const, supportsReasoning: false, contextSize: 128_000 },
    { id: "gpt-4o-mini", displayName: "GPT-4o Mini", provider: "openai" as const, supportsReasoning: false, contextSize: 128_000 },

    // GPT-4 Turbo - 128K context
    { id: "gpt-4-turbo", displayName: "GPT-4 Turbo", provider: "openai" as const, supportsReasoning: false, contextSize: 128_000 },
  ] satisfies ModelDefinition[],

  /** Anthropic models with extended thinking support info and context sizes */
  anthropic: [
    // Claude 4 series - 200K context
    { id: "claude-sonnet-4-5", displayName: "Claude Sonnet 4.5", provider: "anthropic" as const, supportsReasoning: true, contextSize: 200_000 },
    { id: "claude-opus-4-5", displayName: "Claude Opus 4.5", provider: "anthropic" as const, supportsReasoning: true, contextSize: 200_000 },
    { id: "claude-haiku-4-5", displayName: "Claude Haiku 4.5", provider: "anthropic" as const, supportsReasoning: true, contextSize: 200_000 },
    { id: "claude-opus-4.1", displayName: "Claude Opus 4.1", provider: "anthropic" as const, supportsReasoning: true, contextSize: 200_000 },
    { id: "claude-sonnet-4", displayName: "Claude Sonnet 4", provider: "anthropic" as const, supportsReasoning: true, contextSize: 200_000 },

    // Claude 3.7 series - 200K context
    { id: "claude-3-7-sonnet", displayName: "Claude Sonnet 3.7", provider: "anthropic" as const, supportsReasoning: true, contextSize: 200_000 },

    // Claude 3.5 series (no extended thinking) - 200K context
    { id: "claude-3-5-sonnet-20241022", displayName: "Claude Sonnet 3.5", provider: "anthropic" as const, supportsReasoning: false, contextSize: 200_000 },
    { id: "claude-3-5-haiku-20241022", displayName: "Claude Haiku 3.5", provider: "anthropic" as const, supportsReasoning: false, contextSize: 200_000 },
  ] satisfies ModelDefinition[],

  /** Google AI Studio models (Gemini) with reasoning support and context sizes */
  google: [
    // Gemini 3 series - 1M context
    { id: "gemini-3-pro-preview", displayName: "Gemini 3 Pro", provider: "google" as const, supportsReasoning: true, contextSize: 1_000_000 },

    // Gemini 2.5 series - 1M context
    { id: "gemini-2.5-pro", displayName: "Gemini 2.5 Pro", provider: "google" as const, supportsReasoning: true, contextSize: 1_000_000 },
    { id: "gemini-2.5-flash", displayName: "Gemini 2.5 Flash", provider: "google" as const, supportsReasoning: true, contextSize: 1_000_000 },

    // Gemini 2.0 series - 1M context
    { id: "gemini-2.0-flash", displayName: "Gemini 2.0 Flash", provider: "google" as const, supportsReasoning: false, contextSize: 1_000_000 },

    // Gemini 1.5 series - 1M context
    { id: "gemini-1.5-pro", displayName: "Gemini 1.5 Pro", provider: "google" as const, supportsReasoning: false, contextSize: 1_000_000 },
    { id: "gemini-1.5-flash", displayName: "Gemini 1.5 Flash", provider: "google" as const, supportsReasoning: false, contextSize: 1_000_000 },
  ] satisfies ModelDefinition[],
} as const;

/** All curated models */
export const ALL_CURATED_MODELS: ModelDefinition[] = [
  ...CURATED_MODELS.openai,
  ...CURATED_MODELS.anthropic,
  ...CURATED_MODELS.google,
];

/**
 * Get models for a specific provider
 */
export function getModelsForProvider(provider: ProviderType): ModelDefinition[] {
  switch (provider) {
    case "openai":
      return CURATED_MODELS.openai;
    case "anthropic":
      return CURATED_MODELS.anthropic;
    case "google":
      return CURATED_MODELS.google;
    default:
      return [];
  }
}

/**
 * Find a model definition by ID (supports fuzzy matching)
 */
export function findModelById(id: string): ModelDefinition | null {
  const lowerId = id.toLowerCase();

  // Try exact match first
  const exactMatch = ALL_CURATED_MODELS.find((m) => m.id === id);
  if (exactMatch) return exactMatch;

  // Try case-insensitive match
  const caseInsensitiveMatch = ALL_CURATED_MODELS.find(
    (m) => m.id.toLowerCase() === lowerId,
  );
  if (caseInsensitiveMatch) return caseInsensitiveMatch;

  // Try prefix match for model IDs with date suffixes (e.g., claude-sonnet-4-5-20241022)
  const prefixMatch = ALL_CURATED_MODELS.find((m) =>
    lowerId.startsWith(m.id.toLowerCase()),
  );
  if (prefixMatch) return prefixMatch;

  // Try partial match where curated ID contains the query or vice versa
  const partialMatch = ALL_CURATED_MODELS.find(
    (m) =>
      m.id.toLowerCase().includes(lowerId) ||
      lowerId.includes(m.id.toLowerCase()),
  );
  if (partialMatch) return partialMatch;

  return null;
}

/**
 * Check if a model supports reasoning/extended thinking
 */
export function modelSupportsReasoning(modelId: string): boolean {
  return findModelById(modelId)?.supportsReasoning ?? false;
}

/**
 * Get the context size for a model
 */
export function getModelContextSize(modelId: string): number | null {
  return findModelById(modelId)?.contextSize ?? null;
}

/**
 * Get model IDs for a provider (just the string IDs)
 */
export function getModelIdsForProvider(provider: ProviderType): string[] {
  return getModelsForProvider(provider).map((m) => m.id);
}

/**
 * Format context size for display
 */
export function formatContextSize(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(0)}M`;
  }
  return `${(tokens / 1_000).toFixed(0)}K`;
}
