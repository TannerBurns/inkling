import { useState, useEffect } from "react";
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
 * Assistant settings tab for customizing the AI assistant behavior
 */
export function AssistantSettings() {
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_PROMPT);
  const [savedPrompt, setSavedPrompt] = useState(DEFAULT_PROMPT);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Load the default system prompt on mount
  useEffect(() => {
    async function loadPrompt() {
      try {
        const prompt = await getDefaultSystemPrompt();
        setSystemPrompt(prompt);
        setSavedPrompt(prompt);
      } catch (error) {
        console.warn("Failed to load system prompt:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadPrompt();
  }, []);

  const hasChanges = systemPrompt !== savedPrompt;

  const handleReset = () => {
    setSystemPrompt(DEFAULT_PROMPT);
    setMessage(null);
  };

  const handleRevert = () => {
    setSystemPrompt(savedPrompt);
    setMessage(null);
  };

  // Note: Currently the system prompt is stored per-conversation in the database
  // This UI provides a preview of the default prompt that will be used for new conversations
  // Future enhancement: Store custom default prompt in settings table

  return (
    <div className="space-y-6">
      {/* System Prompt Section */}
      <div>
        <h4
          className="mb-2 text-sm font-medium"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Default System Prompt
        </h4>
        <p
          className="mb-3 text-xs"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          This prompt defines how the Inkling assistant behaves. It is included
          at the start of every conversation to guide the AI's responses.
        </p>

        {isLoading ? (
          <div
            className="flex h-48 items-center justify-center rounded-lg border"
            style={{
              backgroundColor: "var(--color-bg-secondary)",
              borderColor: "var(--color-border)",
            }}
          >
            <div
              className="h-5 w-5 animate-spin rounded-full border-2 border-t-transparent"
              style={{ borderColor: "var(--color-accent)" }}
            />
          </div>
        ) : (
          <textarea
            value={systemPrompt}
            onChange={(e) => {
              setSystemPrompt(e.target.value);
              setMessage(null);
            }}
            className="h-48 w-full resize-y rounded-lg border p-3 text-sm outline-none transition-colors focus:border-[var(--color-accent)]"
            style={{
              backgroundColor: "var(--color-bg-secondary)",
              borderColor: "var(--color-border)",
              color: "var(--color-text-primary)",
            }}
            placeholder="Enter the system prompt..."
          />
        )}

        {/* Actions */}
        <div className="mt-3 flex items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={handleReset}
              className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--color-bg-hover)]"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Reset to Default
            </button>
            {hasChanges && (
              <button
                onClick={handleRevert}
                className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--color-bg-hover)]"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Revert Changes
              </button>
            )}
          </div>

          {message && (
            <span
              className="text-xs"
              style={{
                color:
                  message.type === "success"
                    ? "var(--color-success)"
                    : "var(--color-danger)",
              }}
            >
              {message.text}
            </span>
          )}
        </div>
      </div>

      {/* Chat Behavior Section */}
      <div
        className="border-t pt-6"
        style={{ borderColor: "var(--color-border)" }}
      >
        <h4
          className="mb-2 text-sm font-medium"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Chat Behavior
        </h4>

        <div className="space-y-4">
          {/* Auto-retrieve notes */}
          <div className="flex items-start justify-between">
            <div>
              <label
                className="text-sm"
                style={{ color: "var(--color-text-primary)" }}
              >
                Auto-retrieve related notes
              </label>
              <p
                className="text-xs"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                Automatically search for relevant notes to include as context
              </p>
            </div>
            <input
              type="number"
              min={0}
              max={10}
              defaultValue={5}
              className="w-16 rounded-md border px-2 py-1 text-center text-sm"
              style={{
                backgroundColor: "var(--color-bg-secondary)",
                borderColor: "var(--color-border)",
                color: "var(--color-text-primary)",
              }}
            />
          </div>

          {/* Show citations */}
          <div className="flex items-start justify-between">
            <div>
              <label
                className="text-sm"
                style={{ color: "var(--color-text-primary)" }}
              >
                Show note citations
              </label>
              <p
                className="text-xs"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                Display which notes were used to generate responses
              </p>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                defaultChecked
                className="peer sr-only"
              />
              <div
                className="peer h-5 w-9 rounded-full after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:transition-all after:content-[''] peer-checked:after:translate-x-full"
                style={{
                  backgroundColor: "var(--color-bg-tertiary)",
                }}
              />
            </label>
          </div>
        </div>
      </div>

      {/* Keyboard Shortcuts */}
      <div
        className="border-t pt-6"
        style={{ borderColor: "var(--color-border)" }}
      >
        <h4
          className="mb-3 text-sm font-medium"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Keyboard Shortcuts
        </h4>

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
  );
}

export default AssistantSettings;
