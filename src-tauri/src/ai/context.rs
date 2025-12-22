//! Context Manager for Agent Token Tracking
//!
//! Provides a reusable context window manager for long-running agents.
//! Tracks token usage from API responses and determines when history
//! compression is needed.

#![allow(dead_code)]

use super::config::{AIProvider, ProviderType};
use super::llm::TokenUsage;

/// Manages context window for long-running agents
///
/// Tracks cumulative token usage and determines when the context
/// window is filling up and compression may be needed.
#[derive(Debug, Clone)]
pub struct ContextManager {
    /// Provider's context limit in tokens
    context_limit: u32,
    /// Cumulative prompt tokens used (from API responses)
    total_prompt_tokens: u32,
    /// Cumulative completion tokens used (from API responses)
    total_completion_tokens: u32,
    /// Current estimated context usage (prompt tokens from last request)
    current_context_tokens: u32,
    /// Threshold percentage to trigger compression (default 70%)
    compression_threshold: f32,
    /// Number of recent messages to preserve during compression
    preserve_recent_count: usize,
}

impl Default for ContextManager {
    fn default() -> Self {
        Self {
            context_limit: 128_000, // Safe default
            total_prompt_tokens: 0,
            total_completion_tokens: 0,
            current_context_tokens: 0,
            compression_threshold: 0.70,
            preserve_recent_count: 15,
        }
    }
}

impl ContextManager {
    /// Create a new context manager for a specific provider
    pub fn for_provider(provider: &AIProvider) -> Self {
        Self {
            context_limit: provider.effective_context_length(),
            ..Default::default()
        }
    }

    /// Create a context manager for a provider type with optional custom limit
    pub fn for_provider_type(provider_type: ProviderType, custom_limit: Option<u32>) -> Self {
        Self {
            context_limit: custom_limit.unwrap_or_else(|| provider_type.default_context_length()),
            ..Default::default()
        }
    }

    /// Create a context manager with a specific limit
    pub fn with_limit(context_limit: u32) -> Self {
        Self {
            context_limit,
            ..Default::default()
        }
    }

    /// Set the compression threshold (0.0 to 1.0)
    pub fn with_threshold(mut self, threshold: f32) -> Self {
        self.compression_threshold = threshold.clamp(0.1, 0.95);
        self
    }

    /// Set the number of recent messages to preserve during compression
    pub fn with_preserve_count(mut self, count: usize) -> Self {
        self.preserve_recent_count = count;
        self
    }

    /// Record token usage from an API response
    ///
    /// The prompt_tokens from the response indicates the current context size
    /// being sent to the model.
    pub fn record_usage(&mut self, usage: &TokenUsage) {
        self.total_prompt_tokens += usage.prompt_tokens;
        self.total_completion_tokens += usage.completion_tokens;
        // The prompt tokens from the last request represents current context size
        self.current_context_tokens = usage.prompt_tokens;
    }

    /// Check if the context should be compressed
    ///
    /// Returns true if current context usage exceeds the compression threshold
    pub fn should_compress(&self) -> bool {
        let threshold_tokens = (self.context_limit as f32 * self.compression_threshold) as u32;
        self.current_context_tokens > threshold_tokens
    }

    /// Get the current context usage as a percentage of the limit
    pub fn usage_percentage(&self) -> f32 {
        if self.context_limit == 0 {
            return 0.0;
        }
        (self.current_context_tokens as f32 / self.context_limit as f32) * 100.0
    }

    /// Get estimated remaining tokens in the context window
    pub fn remaining_tokens(&self) -> u32 {
        self.context_limit.saturating_sub(self.current_context_tokens)
    }

    /// Get the context limit
    pub fn context_limit(&self) -> u32 {
        self.context_limit
    }

    /// Get current context token count
    pub fn current_tokens(&self) -> u32 {
        self.current_context_tokens
    }

    /// Get total prompt tokens used across all requests
    pub fn total_prompt_tokens(&self) -> u32 {
        self.total_prompt_tokens
    }

    /// Get total completion tokens used across all requests
    pub fn total_completion_tokens(&self) -> u32 {
        self.total_completion_tokens
    }

    /// Get the number of recent messages to preserve during compression
    pub fn preserve_recent_count(&self) -> usize {
        self.preserve_recent_count
    }

    /// Reset the context manager (e.g., after compression)
    pub fn reset_current(&mut self) {
        self.current_context_tokens = 0;
    }

    /// Get a status summary for logging/debugging
    pub fn status_summary(&self) -> String {
        format!(
            "Context: {}/{} tokens ({:.1}%), threshold: {:.0}%, remaining: {}",
            self.current_context_tokens,
            self.context_limit,
            self.usage_percentage(),
            self.compression_threshold * 100.0,
            self.remaining_tokens()
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_context_manager_defaults() {
        let cm = ContextManager::default();
        assert_eq!(cm.context_limit, 128_000);
        assert_eq!(cm.compression_threshold, 0.70);
        assert_eq!(cm.current_tokens(), 0);
    }

    #[test]
    fn test_for_provider_type() {
        let cm = ContextManager::for_provider_type(ProviderType::OpenAI, None);
        assert_eq!(cm.context_limit, 200_000);

        let cm = ContextManager::for_provider_type(ProviderType::Google, None);
        assert_eq!(cm.context_limit, 1_000_000);

        let cm = ContextManager::for_provider_type(ProviderType::Ollama, Some(8192));
        assert_eq!(cm.context_limit, 8192);
    }

    #[test]
    fn test_record_usage() {
        let mut cm = ContextManager::with_limit(100_000);
        
        cm.record_usage(&TokenUsage {
            prompt_tokens: 5000,
            completion_tokens: 500,
            total_tokens: 5500,
        });
        
        assert_eq!(cm.current_tokens(), 5000);
        assert_eq!(cm.total_prompt_tokens(), 5000);
        assert_eq!(cm.total_completion_tokens(), 500);
        assert!(!cm.should_compress());
    }

    #[test]
    fn test_should_compress() {
        let mut cm = ContextManager::with_limit(100_000).with_threshold(0.70);
        
        // 60% usage - should not compress
        cm.record_usage(&TokenUsage {
            prompt_tokens: 60_000,
            completion_tokens: 1000,
            total_tokens: 61_000,
        });
        assert!(!cm.should_compress());
        
        // 75% usage - should compress
        cm.record_usage(&TokenUsage {
            prompt_tokens: 75_000,
            completion_tokens: 1000,
            total_tokens: 76_000,
        });
        assert!(cm.should_compress());
    }

    #[test]
    fn test_usage_percentage() {
        let mut cm = ContextManager::with_limit(100_000);
        
        cm.record_usage(&TokenUsage {
            prompt_tokens: 50_000,
            completion_tokens: 1000,
            total_tokens: 51_000,
        });
        
        assert!((cm.usage_percentage() - 50.0).abs() < 0.1);
    }

    #[test]
    fn test_remaining_tokens() {
        let mut cm = ContextManager::with_limit(100_000);
        
        cm.record_usage(&TokenUsage {
            prompt_tokens: 30_000,
            completion_tokens: 1000,
            total_tokens: 31_000,
        });
        
        assert_eq!(cm.remaining_tokens(), 70_000);
    }
}

