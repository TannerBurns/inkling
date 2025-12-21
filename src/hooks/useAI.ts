/**
 * useAI - React hook for AI operations
 *
 * Provides a unified interface for interacting with AI models
 * through the configured AI providers.
 */

import { useCallback, useEffect, useState } from "react";
import { useSettingsStore } from "../stores/settingsStore";
import type { AIProvider } from "../types/ai";
import type { ReasoningEffort, ThinkingConfig } from "../types/models";
import { findModelById, modelSupportsReasoning, getModelContextSize } from "../types/models";

/** Message in a chat conversation */
export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/** Options for chat completion */
export interface ChatOptions {
  /** Model to use (format: provider/model, e.g., "openai/gpt-4o") */
  model?: string;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Temperature for randomness (0-2) */
  temperature?: number;
  /** System prompt to prepend */
  systemPrompt?: string;
  
  // Reasoning/Thinking options
  /** Enable reasoning/thinking mode (auto-detected based on model if not specified) */
  enableReasoning?: boolean;
  /** Reasoning effort for OpenAI models (low, medium, high) */
  reasoningEffort?: ReasoningEffort;
  /** Thinking configuration for Anthropic models */
  thinking?: ThinkingConfig;
  /** Budget tokens for thinking (Anthropic) or reasoning (general) */
  thinkingBudget?: number;
  
  // Abort controller for cancellation
  /** AbortSignal to cancel the request */
  signal?: AbortSignal;
}

/** Stream event types */
export type StreamEventType = "content" | "thinking" | "done" | "error";

/** Stream event data */
export interface StreamEvent {
  type: StreamEventType;
  /** Content delta (for content/thinking events) */
  content?: string;
  /** Error message (for error events) */
  error?: string;
  /** Final response data (for done events) */
  response?: ChatResponse;
}

/** Callbacks for streaming */
export interface StreamCallbacks {
  /** Called for each content chunk */
  onContent?: (content: string) => void;
  /** Called for each thinking/reasoning chunk */
  onThinking?: (thinking: string) => void;
  /** Called when streaming is complete */
  onDone?: (response: ChatResponse) => void;
  /** Called on error */
  onError?: (error: Error) => void;
}

/** Stream controller for managing an ongoing stream */
export interface StreamController {
  /** Abort the stream */
  abort: () => void;
  /** Promise that resolves when streaming is complete */
  done: Promise<ChatResponse>;
}

/** Response from a chat completion */
export interface ChatResponse {
  content: string;
  model: string;
  finishReason: string;
  /** Thinking/reasoning content if available */
  thinking?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/** Model info with context and reasoning support */
export interface ModelInfo {
  id: string;
  displayName: string;
  contextSize: number;
  supportsReasoning: boolean;
}

/** AI readiness status */
export type AIStatus = "ready" | "not_configured" | "error";

/** Return type of useAI hook */
export interface UseAIResult {
  /** Whether the AI system is ready */
  isReady: boolean;
  /** Current AI status */
  status: AIStatus;
  /** List of enabled providers */
  enabledProviders: AIProvider[];
  /** Default provider if set */
  defaultProvider: AIProvider | null;
  /** Send a chat message and get a response */
  chat: (messages: ChatMessage[], options?: ChatOptions) => Promise<ChatResponse>;
  /** Stream a chat completion with callbacks */
  chatStream: (
    messages: ChatMessage[],
    callbacks: StreamCallbacks,
    options?: ChatOptions,
  ) => StreamController;
  /** Async generator for streaming (alternative API) */
  chatStreamAsync: (
    messages: ChatMessage[],
    options?: ChatOptions,
  ) => AsyncGenerator<StreamEvent, ChatResponse, unknown>;
  /** Simple completion from a prompt */
  complete: (prompt: string, options?: ChatOptions) => Promise<string>;
  /** Stream a simple completion */
  completeStream: (
    prompt: string,
    callbacks: StreamCallbacks,
    options?: ChatOptions,
  ) => StreamController;
  /** Refresh the status */
  refresh: () => Promise<void>;
  /** Get model info including context size and reasoning support */
  getModelInfo: (modelId: string) => ModelInfo | null;
  /** Check if a model supports reasoning/thinking */
  supportsReasoning: (modelId: string) => boolean;
  /** Get context size for a model */
  getContextSize: (modelId: string) => number | null;
}

/**
 * Hook for AI operations
 */
export function useAI(): UseAIResult {
  const {
    aiConfig,
    loadAIConfig,
  } = useSettingsStore();

  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize on mount
  useEffect(() => {
    if (!isInitialized) {
      loadAIConfig();
      setIsInitialized(true);
    }
  }, [isInitialized, loadAIConfig]);

  const enabledProviders = aiConfig?.providers.filter((p) => p.isEnabled) ?? [];

  const defaultProvider =
    aiConfig?.defaultProvider
      ? (aiConfig.providers.find((p) => p.id === aiConfig.defaultProvider) ?? null)
      : enabledProviders[0] ?? null;

  // AI is ready if we have at least one enabled provider with a model
  const isReady = enabledProviders.length > 0 && enabledProviders.some(p => p.models.length > 0 || p.selectedModel);
  
  const status: AIStatus = enabledProviders.length === 0 ? "not_configured" : "ready";

  /**
   * Get the model string for the API call
   */
  const getModelString = useCallback(
    (options?: ChatOptions): string => {
      if (options?.model) {
        return options.model;
      }

      // Use default provider's selected model or first model
      if (defaultProvider) {
        const model = defaultProvider.selectedModel ?? defaultProvider.models[0];
        if (model) {
          const providerPrefix = getProviderPrefix(defaultProvider.type);
          return `${providerPrefix}/${model}`;
        }
      }

      // Fallback to OpenAI GPT-4o-mini
      return "openai/gpt-4o-mini";
    },
    [defaultProvider],
  );

  /**
   * Build the request body with reasoning/thinking parameters
   */
  const buildRequestBody = useCallback(
    (
      model: string,
      messages: ChatMessage[],
      options?: ChatOptions,
    ): Record<string, unknown> => {
      const body: Record<string, unknown> = {
        model,
        messages,
      };

      // Add basic options
      if (options?.maxTokens) {
        body.max_tokens = options.maxTokens;
      }
      if (options?.temperature !== undefined) {
        body.temperature = options.temperature;
      }

      // Determine if we should enable reasoning
      const modelId = model.split("/").pop() ?? model;
      const modelDef = findModelById(modelId);
      const shouldUseReasoning =
        options?.enableReasoning ??
        (modelDef?.supportsReasoning ?? false);

      if (!shouldUseReasoning) {
        return body;
      }

      // Determine provider from model string
      const provider = model.split("/")[0]?.toLowerCase();

      if (provider === "openai") {
        // OpenAI uses reasoning_effort parameter
        body.reasoning_effort = options?.reasoningEffort ?? "medium";
      } else if (provider === "anthropic") {
        // Anthropic uses thinking configuration
        if (options?.thinking) {
          body.thinking = {
            type: "enabled",
            budget_tokens: options.thinking.budgetTokens ?? options.thinkingBudget ?? 10000,
          };
        } else if (options?.thinkingBudget) {
          body.thinking = {
            type: "enabled",
            budget_tokens: options.thinkingBudget,
          };
        } else {
          // Default thinking config for Anthropic
          body.thinking = {
            type: "enabled",
            budget_tokens: 10000,
          };
        }
      } else if (provider === "google") {
        // Google models may use thinking in the future
        // For now, we don't add any special parameters
      }

      return body;
    },
    [],
  );

  /**
   * Get the base URL for a provider
   */
  const getProviderBaseUrl = useCallback(
    (providerType: string): string => {
      const provider = enabledProviders.find(p => p.type === providerType);
      if (provider?.baseUrl) {
        return provider.baseUrl;
      }
      
      // Default URLs for each provider
      switch (providerType) {
        case "openai":
          return "https://api.openai.com";
        case "anthropic":
          return "https://api.anthropic.com";
        case "google":
          return "https://generativelanguage.googleapis.com";
        case "ollama":
          return "http://localhost:11434";
        case "lmstudio":
          return "http://localhost:1234";
        case "vllm":
          return "http://localhost:8000";
        default:
          return "http://localhost:8000";
      }
    },
    [enabledProviders],
  );

  /**
   * Get API key for a provider
   */
  const getProviderApiKey = useCallback(
    (providerType: string): string | undefined => {
      const provider = enabledProviders.find(p => p.type === providerType);
      return provider?.apiKey;
    },
    [enabledProviders],
  );

  /**
   * Parse SSE line and extract data
   */
  const parseSSELine = (line: string): Record<string, unknown> | null => {
    if (!line.startsWith("data: ")) return null;
    const data = line.slice(6).trim();
    if (data === "[DONE]") return { done: true };
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  };

  /**
   * Process a stream response and yield events
   */
  async function* processStream(
    response: Response,
    model: string,
  ): AsyncGenerator<StreamEvent, ChatResponse, unknown> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No response body");
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let fullContent = "";
    let fullThinking = "";
    let finishReason = "unknown";
    let usageData: ChatResponse["usage"] | undefined;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine || trimmedLine.startsWith(":")) continue;

          const data = parseSSELine(trimmedLine);
          if (!data) continue;

          if (data.done) {
            // Stream complete
            continue;
          }

          // Handle OpenAI-format streaming response
          const choice = (data.choices as Array<Record<string, unknown>>)?.[0];
          if (choice) {
            const delta = choice.delta as Record<string, unknown> | undefined;
            
            // Check for content delta
            if (delta?.content) {
              const content = delta.content as string;
              fullContent += content;
              yield { type: "content", content };
            }
            
            // Check for thinking/reasoning delta (Anthropic extended thinking)
            if (delta?.thinking) {
              const thinking = delta.thinking as string;
              fullThinking += thinking;
              yield { type: "thinking", content: thinking };
            }
            
            // Check for finish reason
            if (choice.finish_reason) {
              finishReason = choice.finish_reason as string;
            }
          }

          // Handle usage data (usually comes at the end)
          if (data.usage) {
            const usage = data.usage as Record<string, number>;
            usageData = {
              promptTokens: usage.prompt_tokens ?? 0,
              completionTokens: usage.completion_tokens ?? 0,
              totalTokens: usage.total_tokens ?? 0,
            };
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        const data = parseSSELine(buffer.trim());
        if (data && !data.done) {
          const choice = (data.choices as Array<Record<string, unknown>>)?.[0];
          if (choice?.delta) {
            const delta = choice.delta as Record<string, unknown>;
            if (delta.content) {
              const content = delta.content as string;
              fullContent += content;
              yield { type: "content", content };
            }
          }
        }
      }

      const finalResponse: ChatResponse = {
        content: fullContent,
        model: model,
        finishReason,
        thinking: fullThinking || undefined,
        usage: usageData,
      };

      yield { type: "done", response: finalResponse };
      return finalResponse;
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Stream a chat completion with async generator
   */
  const chatStreamAsync = useCallback(
    async function* (
      messages: ChatMessage[],
      options?: ChatOptions,
    ): AsyncGenerator<StreamEvent, ChatResponse, unknown> {
      if (!isReady) {
        throw new Error("No AI provider configured. Please enable a provider in Settings.");
      }

      const model = getModelString(options);
      const providerType = model.split("/")[0];
      const baseUrl = getProviderBaseUrl(providerType);
      const apiKey = getProviderApiKey(providerType);

      // Prepend system prompt if provided
      const allMessages: ChatMessage[] = options?.systemPrompt
        ? [{ role: "system", content: options.systemPrompt }, ...messages]
        : messages;

      const requestBody = buildRequestBody(model, allMessages, options);
      // Enable streaming
      requestBody.stream = true;

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      };
      
      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }

      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        signal: options?.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`AI request failed: ${response.status} - ${errorText}`);
      }

      return yield* processStream(response, model);
    },
    [isReady, getModelString, buildRequestBody, getProviderBaseUrl, getProviderApiKey],
  );

  /**
   * Stream a chat completion with callbacks
   */
  const chatStream = useCallback(
    (
      messages: ChatMessage[],
      callbacks: StreamCallbacks,
      options?: ChatOptions,
    ): StreamController => {
      const abortController = new AbortController();
      const mergedOptions = { ...options, signal: abortController.signal };

      const done = (async (): Promise<ChatResponse> => {
        try {
          const generator = chatStreamAsync(messages, mergedOptions);
          let result: ChatResponse | undefined;

          for await (const event of generator) {
            switch (event.type) {
              case "content":
                callbacks.onContent?.(event.content ?? "");
                break;
              case "thinking":
                callbacks.onThinking?.(event.content ?? "");
                break;
              case "done":
                result = event.response;
                callbacks.onDone?.(event.response!);
                break;
              case "error":
                throw new Error(event.error ?? "Unknown streaming error");
            }
          }

          if (!result) {
            throw new Error("Stream ended without final response");
          }

          return result;
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          if (err.name !== "AbortError") {
            callbacks.onError?.(err);
          }
          throw err;
        }
      })();

      return {
        abort: () => abortController.abort(),
        done,
      };
    },
    [chatStreamAsync],
  );

  /**
   * Send a chat completion request (non-streaming)
   */
  const chat = useCallback(
    async (
      messages: ChatMessage[],
      options?: ChatOptions,
    ): Promise<ChatResponse> => {
      if (!isReady) {
        throw new Error("No AI provider configured. Please enable a provider in Settings.");
      }

      const model = getModelString(options);
      const providerType = model.split("/")[0];
      const baseUrl = getProviderBaseUrl(providerType);
      const apiKey = getProviderApiKey(providerType);

      // Prepend system prompt if provided
      const allMessages: ChatMessage[] = options?.systemPrompt
        ? [{ role: "system", content: options.systemPrompt }, ...messages]
        : messages;

      const requestBody = buildRequestBody(model, allMessages, options);

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      
      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }

      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        signal: options?.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`AI request failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      // Extract thinking content if present (Anthropic format)
      let thinkingContent: string | undefined;
      const messageContent = data.choices[0]?.message;
      if (messageContent?.thinking) {
        thinkingContent = messageContent.thinking;
      }

      return {
        content: messageContent?.content ?? "",
        model: data.model,
        finishReason: data.choices[0]?.finish_reason ?? "unknown",
        thinking: thinkingContent,
        usage: data.usage
          ? {
              promptTokens: data.usage.prompt_tokens,
              completionTokens: data.usage.completion_tokens,
              totalTokens: data.usage.total_tokens,
            }
          : undefined,
      };
    },
    [isReady, getModelString, buildRequestBody, getProviderBaseUrl, getProviderApiKey],
  );

  /**
   * Simple completion from a prompt
   */
  const complete = useCallback(
    async (prompt: string, options?: ChatOptions): Promise<string> => {
      const response = await chat([{ role: "user", content: prompt }], options);
      return response.content;
    },
    [chat],
  );

  /**
   * Stream a simple completion
   */
  const completeStream = useCallback(
    (
      prompt: string,
      callbacks: StreamCallbacks,
      options?: ChatOptions,
    ): StreamController => {
      return chatStream([{ role: "user", content: prompt }], callbacks, options);
    },
    [chatStream],
  );

  /**
   * Refresh config
   */
  const refresh = useCallback(async () => {
    await loadAIConfig();
  }, [loadAIConfig]);

  /**
   * Get model info including context size and reasoning support
   */
  const getModelInfo = useCallback((modelId: string): ModelInfo | null => {
    const model = findModelById(modelId);
    if (!model) return null;
    return {
      id: model.id,
      displayName: model.displayName,
      contextSize: model.contextSize,
      supportsReasoning: model.supportsReasoning,
    };
  }, []);

  /**
   * Check if a model supports reasoning/thinking
   */
  const supportsReasoningFn = useCallback((modelId: string): boolean => {
    return modelSupportsReasoning(modelId);
  }, []);

  /**
   * Get context size for a model
   */
  const getContextSizeFn = useCallback((modelId: string): number | null => {
    return getModelContextSize(modelId);
  }, []);

  return {
    isReady,
    status,
    enabledProviders,
    defaultProvider,
    chat,
    chatStream,
    chatStreamAsync,
    complete,
    completeStream,
    refresh,
    getModelInfo,
    supportsReasoning: supportsReasoningFn,
    getContextSize: getContextSizeFn,
  };
}

/**
 * Get the provider prefix for model strings
 */
function getProviderPrefix(type: string): string {
  switch (type) {
    case "openai":
      return "openai";
    case "anthropic":
      return "anthropic";
    case "google":
      return "google";
    case "ollama":
      return "ollama";
    case "lmstudio":
      return "lmstudio";
    case "vllm":
      return "vllm";
    default:
      return "openai";
  }
}

export default useAI;
