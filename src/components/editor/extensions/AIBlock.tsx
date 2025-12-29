import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useCallback, useEffect, useState, useRef } from "react";
import {
  Sparkles,
  Loader2,
  X,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { marked } from "marked";
import type { AgentProgress } from "../../../types/agent";
import * as agentsApi from "../../../lib/agents";
import { useAgentActivityStore } from "../../../stores/agentActivityStore";

// Configure marked for safe HTML output
marked.setOptions({
  gfm: true,
  breaks: true,
});

export interface AIBlockOptions {
  HTMLAttributes: Record<string, unknown>;
}

export interface AIBlockAttrs {
  id: string;
  state: "input" | "processing" | "preview" | "accepted" | "error";
  request: string;
  response: string;
  toolsUsed: string[];
  progress: string[];
  error: string;
}

// Type guard to safely access attrs
function getAIBlockAttrs(attrs: Record<string, unknown>): AIBlockAttrs {
  return {
    id: (attrs.id as string) || "",
    state: (attrs.state as AIBlockAttrs["state"]) || "input",
    request: (attrs.request as string) || "",
    response: (attrs.response as string) || "",
    toolsUsed: (attrs.toolsUsed as string[]) || [],
    progress: (attrs.progress as string[]) || [],
    error: (attrs.error as string) || "",
  };
}

/**
 * AIBlock extension for TipTap
 * Enables inline AI assistant with input/processing/preview/accepted states
 */
export const aiBlock = Node.create<AIBlockOptions>({
  name: "aiBlock",

  group: "block",

  // No content - this is a self-contained atom node
  atom: true,

  selectable: true,

  draggable: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      id: {
        default: () => `ai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      },
      state: {
        default: "input",
      },
      request: {
        default: "",
      },
      response: {
        default: "",
      },
      toolsUsed: {
        default: [],
      },
      progress: {
        default: [],
      },
      error: {
        default: "",
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-ai-block="true"]',
        getAttrs: (element) => {
          const el = element as HTMLElement;
          return {
            id: el.getAttribute("data-id"),
            state: el.getAttribute("data-state") || "input",
            request: el.getAttribute("data-request") || "",
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    // For atom nodes, include text content (not a content hole)
    return [
      "div",
      mergeAttributes(
        { 
          "data-ai-block": "true",
          "data-id": node.attrs.id,
          "data-state": node.attrs.state,
          "data-request": node.attrs.request,
          "class": "ai-block-placeholder",
        }, 
        this.options.HTMLAttributes, 
        HTMLAttributes
      ),
      `[AI: ${node.attrs.request || "pending"}]`,
    ];
  },

  renderText({ node }) {
    // Return plain text representation for copy/paste
    if (node.attrs.state === "preview" && node.attrs.response) {
      return node.attrs.response;
    }
    return `[AI: ${node.attrs.request || "pending"}]`;
  },

  addNodeView() {
    return ReactNodeViewRenderer(AIBlockComponent);
  },

  addCommands() {
    return {
      insertAIBlock:
        () =>
        ({ chain }) => {
          return chain()
            .insertContent({
              type: this.name,
              attrs: {
                id: `ai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                state: "input",
              },
            })
            .run();
        },
    };
  },
});

// Declare the command type
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    aiBlock: {
      insertAIBlock: () => ReturnType;
    };
  }
}

/**
 * AIBlock React component rendered by the node view
 */
function AIBlockComponent({ node, updateAttributes, deleteNode, editor }: NodeViewProps) {
  const attrs = getAIBlockAttrs(node.attrs);
  const [inputValue, setInputValue] = useState(attrs.request || "");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const unlistenRef = useRef<(() => void) | null>(null);
  const { queueTask } = useAgentActivityStore();

  // Focus input on mount if in input state
  useEffect(() => {
    if (attrs.state === "input" && inputRef.current) {
      inputRef.current.focus();
    }
  }, [attrs.state]);

  // Clean up event listener on unmount
  useEffect(() => {
    return () => {
      if (unlistenRef.current) {
        unlistenRef.current();
      }
    };
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!inputValue.trim()) return;

    const executionId = agentsApi.generateExecutionId();
    console.log("[AIBlock] Starting agent execution:", executionId);
    
    // Track progress messages locally to avoid stale closure issues
    let progressMessages: string[] = ["Starting..."];
    
    updateAttributes({
      request: inputValue,
      state: "processing",
      progress: progressMessages,
      error: "",
    });

    // Queue the inline agent execution
    try {
      await queueTask(
        {
          id: executionId,
          type: "inline",
          description: inputValue.length > 50 ? inputValue.slice(0, 50) + "..." : inputValue,
        },
        async () => {
          console.log("[AIBlock] Setting up progress listener...");
          const unlisten = await agentsApi.listenForAgentProgress(
            executionId,
            (progress: AgentProgress) => {
              console.log("[AIBlock] Progress event:", JSON.stringify(progress));
              try {
                switch (progress.type) {
                  case "started":
                    progressMessages = [...progressMessages, `Agent started: ${progress.agentName || "Inline Assistant"}`];
                    updateAttributes({ progress: progressMessages });
                    break;
                  case "toolCalling":
                    progressMessages = [...progressMessages, `Using ${progress.toolName || "tool"}...`];
                    updateAttributes({ progress: progressMessages });
                    break;
                  case "toolResult":
                    progressMessages = [...progressMessages, `${progress.success ? "✓" : "✗"} ${progress.toolName || "tool"}`];
                    updateAttributes({ progress: progressMessages });
                    break;
                  case "thinking":
                    progressMessages = [...progressMessages, progress.message || "Thinking..."];
                    updateAttributes({ progress: progressMessages });
                    break;
                  case "completed":
                    console.log("[AIBlock] Agent completed:", progress.result);
                    // Content will be inserted by the main executeInlineAgent result handler
                    // Just update progress to show completion
                    progressMessages = [...progressMessages, "✓ Complete"];
                    updateAttributes({ progress: progressMessages });
                    break;
                  case "error":
                    console.error("[AIBlock] Agent error:", progress.message);
                    updateAttributes({
                      state: "error",
                      error: progress.message || "Unknown error",
                    });
                    break;
                  case "cancelled":
                    console.log("[AIBlock] Agent cancelled");
                    updateAttributes({
                      state: "input",
                      progress: [],
                    });
                    break;
                }
              } catch (e) {
                console.error("[AIBlock] Error handling progress:", e);
              }
            }
          );
          unlistenRef.current = unlisten;

          // Execute the agent with the current note content as context
          console.log("[AIBlock] Calling execute_inline_agent...");
          const noteContext = editor?.getText() ?? undefined;
          const result = await agentsApi.executeInlineAgent(
            executionId,
            inputValue,
            noteContext
          );
          console.log("[AIBlock] Agent result:", result);

          // Clean up progress listener
          if (unlistenRef.current) {
            unlistenRef.current();
            unlistenRef.current = null;
          }

          // Automatically insert content and remove the AI block
          if (result.content) {
            const htmlContent = await marked.parse(result.content);
            deleteNode();
            if (editor) {
              editor.chain().focus().insertContent(htmlContent).run();
            }
          } else {
            // No content returned - show error
            updateAttributes({
              state: "error",
              error: "Agent completed but returned no content",
            });
          }
        }
      );
    } catch (err) {
      console.error("[AIBlock] Error executing agent:", err);
      updateAttributes({
        state: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue, attrs.progress, updateAttributes, queueTask]);

  const handleCancel = useCallback(() => {
    // TODO: Implement cancellation via agentsApi.cancelAgentExecution
    updateAttributes({
      state: "input",
      progress: [],
    });
    deleteNode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateAttributes]);

  const handleRetry = useCallback(() => {
    updateAttributes({
      state: "input",
      response: "",
      toolsUsed: [],
      progress: [],
      error: "",
    });
  }, [updateAttributes]);

  return (
    <NodeViewWrapper className="ai-block-wrapper">
      <div
        className="my-2 rounded-lg border"
        style={{
          backgroundColor: "var(--color-bg-secondary)",
          borderColor: "var(--color-border)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-2 border-b px-3 py-2"
          style={{ borderColor: "var(--color-border)" }}
        >
          <Sparkles size={16} style={{ color: "var(--color-accent)" }} />
          <span
            className="text-sm font-medium"
            style={{ color: "var(--color-text-primary)" }}
          >
            AI Assistant
          </span>
          {attrs.state === "processing" && (
            <Loader2
              size={14}
              className="ml-auto animate-spin"
              style={{ color: "var(--color-accent)" }}
            />
          )}
          {attrs.state !== "processing" && (
            <button
              onClick={deleteNode}
              className="ml-auto p-1 transition-colors"
              style={{ color: "var(--color-text-tertiary)" }}
              title="Remove block"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Content based on state */}
        <div className="p-3">
          {/* Input State */}
          {attrs.state === "input" && (
            <div>
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="What would you like me to help with? (e.g., research, create a diagram, expand on this topic...)"
                className="w-full resize-none rounded-lg border px-3 py-2 text-sm"
                style={{
                  backgroundColor: "var(--color-bg-primary)",
                  borderColor: "var(--color-border)",
                  color: "var(--color-text-primary)",
                  minHeight: "80px",
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
              />
              <div className="mt-2 flex items-center justify-between">
                <span
                  className="text-xs"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  Press ⌘+Enter to submit
                </span>
                <button
                  onClick={handleSubmit}
                  disabled={!inputValue.trim()}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50"
                  style={{
                    backgroundColor: "var(--color-accent)",
                    color: "white",
                  }}
                >
                  Generate
                </button>
              </div>
            </div>
          )}

          {/* Processing State */}
          {attrs.state === "processing" && (
            <div>
              <div className="mb-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
                {attrs.request}
              </div>
              <div className="space-y-1">
                {(attrs.progress || []).map((msg, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-xs"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    <span>{msg}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={handleCancel}
                className="mt-3 text-xs transition-colors"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                Cancel
              </button>
            </div>
          )}

          {/* Preview state is no longer used - content goes directly to note */}

          {/* Error State */}
          {attrs.state === "error" && (
            <div>
              <div
                className="mb-3 flex items-center gap-2 rounded-lg p-3"
                style={{
                  backgroundColor: "var(--color-error-light)",
                  color: "var(--color-error)",
                }}
              >
                <AlertCircle size={16} />
                <span className="text-sm">{attrs.error}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRetry}
                  className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
                  style={{
                    backgroundColor: "var(--color-accent)",
                    color: "white",
                  }}
                >
                  <RefreshCw size={14} />
                  Try Again
                </button>
                <button
                  onClick={deleteNode}
                  className="text-sm transition-colors"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  );
}

export default aiBlock;
