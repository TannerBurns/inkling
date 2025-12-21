/**
 * Typed wrappers for AI Tauri IPC commands
 */
import { invoke } from "@tauri-apps/api/core";
import type {
  AIConfig,
  AIProvider,
  LocalModelsResult,
  ProviderInfo,
  ProviderTestResult,
  ProviderType,
} from "../types/ai";

// ============================================================================
// AI Configuration
// ============================================================================

/**
 * Get the current AI configuration
 */
export async function getAIConfig(): Promise<AIConfig> {
  return invoke<AIConfig>("get_ai_config");
}

/**
 * Save AI configuration
 */
export async function saveAIConfig(config: AIConfig): Promise<void> {
  return invoke<void>("save_ai_config_cmd", { config });
}

/**
 * Update a single provider's configuration
 */
export async function updateProvider(provider: AIProvider): Promise<AIConfig> {
  return invoke<AIConfig>("update_provider", { provider });
}

/**
 * Set the default provider
 */
export async function setDefaultProvider(
  providerId: string | null,
): Promise<AIConfig> {
  return invoke<AIConfig>("set_default_provider", { providerId });
}

/**
 * Apply AI config changes
 */
export async function applyAIConfig(): Promise<void> {
  return invoke<void>("apply_ai_config");
}

/**
 * Initialize AI config from environment variables
 */
export async function initAIConfig(): Promise<AIConfig> {
  return invoke<AIConfig>("init_ai_config_cmd");
}

// ============================================================================
// Provider Testing & Detection
// ============================================================================

/**
 * Test connection to a specific provider
 */
export async function testProvider(
  provider: AIProvider,
): Promise<ProviderTestResult> {
  return invoke<ProviderTestResult>("test_provider", { provider });
}

/**
 * Detect available local models (Ollama and LM Studio)
 */
export async function detectLocalModels(): Promise<LocalModelsResult> {
  return invoke<LocalModelsResult>("detect_local_models");
}

/**
 * Detect Ollama models specifically
 */
export async function detectOllama(
  baseUrl?: string,
): Promise<ProviderTestResult> {
  return invoke<ProviderTestResult>("detect_ollama", { baseUrl: baseUrl ?? null });
}

/**
 * Detect LM Studio specifically
 */
export async function detectLMStudio(
  baseUrl?: string,
): Promise<ProviderTestResult> {
  return invoke<ProviderTestResult>("detect_lmstudio_cmd", { baseUrl: baseUrl ?? null });
}

// ============================================================================
// Provider Helpers
// ============================================================================

/**
 * Get the list of default providers
 */
export async function getDefaultProviders(): Promise<AIProvider[]> {
  return invoke<AIProvider[]>("get_default_providers");
}

/**
 * Get provider type display info
 */
export async function getProviderInfo(
  providerType: ProviderType,
): Promise<ProviderInfo> {
  return invoke<ProviderInfo>("get_provider_info", { providerType });
}
