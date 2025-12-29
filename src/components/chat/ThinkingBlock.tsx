import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Brain } from "lucide-react";

interface ThinkingBlockProps {
  /** The thinking/reasoning content being streamed */
  content: string;
  /** Whether the content is still being streamed */
  isStreaming?: boolean;
}

/**
 * Displays AI "thinking" content in a compact, scrolling container.
 * Shows greyed-out text that auto-scrolls as new content arrives.
 * Can be expanded to see the full thinking content.
 */
export function ThinkingBlock({ content, isStreaming }: ThinkingBlockProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLPreElement>(null);

  // Auto-scroll to bottom as content streams in (only when collapsed)
  useEffect(() => {
    if (!isExpanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [content, isExpanded]);

  if (!content) {
    return null;
  }

  // Calculate approximate line count for display
  const lineCount = content.split("\n").length;
  const charCount = content.length;

  return (
    <div
      className="rounded-lg border text-sm"
      style={{
        backgroundColor: "var(--color-bg-secondary)",
        borderColor: "var(--color-border)",
      }}
    >
      {/* Header with expand/collapse toggle */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-3 py-2 transition-colors hover:bg-[var(--color-bg-hover)]"
        style={{ borderRadius: isExpanded ? "8px 8px 0 0" : "8px" }}
      >
        <div className="flex items-center gap-2">
          {isStreaming ? (
            <Brain
              size={14}
              className="animate-pulse"
              style={{ color: "var(--color-accent)" }}
            />
          ) : (
            <Brain size={14} style={{ color: "var(--color-text-tertiary)" }} />
          )}
          <span style={{ color: "var(--color-text-secondary)" }}>
            {isStreaming ? "Thinking..." : "Thought process"}
          </span>
          <span
            className="text-xs"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            ({lineCount} lines)
          </span>
        </div>

        {/* Expand/collapse chevron */}
        {isExpanded ? (
          <ChevronDown size={14} style={{ color: "var(--color-text-tertiary)" }} />
        ) : (
          <ChevronRight size={14} style={{ color: "var(--color-text-tertiary)" }} />
        )}
      </button>

      {/* Collapsed view: scrolling preview window - only show while streaming */}
      {!isExpanded && isStreaming && (
        <div className="relative">
          {/* Fade overlay at top to indicate scrollable content */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-10 h-4"
            style={{
              background: "linear-gradient(to bottom, var(--color-bg-secondary), transparent)",
            }}
          />
          
          <div
            ref={scrollRef}
            className="overflow-hidden px-3 pb-2"
            style={{
              maxHeight: "120px", // ~4-6 lines
            }}
          >
            <pre
              ref={contentRef}
              className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed"
              style={{ 
                color: "var(--color-text-tertiary)",
                fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
              }}
            >
              {content}
              <span
                className="ml-0.5 inline-block h-3 w-0.5 animate-pulse"
                style={{ backgroundColor: "var(--color-text-tertiary)" }}
              />
            </pre>
          </div>
        </div>
      )}

      {/* Expanded view: full content */}
      {isExpanded && (
        <div
          className="border-t px-3 py-2"
          style={{ borderColor: "var(--color-border)" }}
        >
          <div
            className="overflow-y-auto"
            style={{ maxHeight: "400px" }}
          >
            <pre
              className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed"
              style={{ 
                color: "var(--color-text-tertiary)",
                fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
              }}
            >
              {content}
              {isStreaming && (
                <span
                  className="ml-0.5 inline-block h-3 w-0.5 animate-pulse"
                  style={{ backgroundColor: "var(--color-text-tertiary)" }}
                />
              )}
            </pre>
          </div>
          <div
            className="mt-2 text-xs"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            {charCount.toLocaleString()} characters
          </div>
        </div>
      )}
    </div>
  );
}

export default ThinkingBlock;

