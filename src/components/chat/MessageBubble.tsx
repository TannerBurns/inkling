import { useState, useRef, useEffect, memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import type { Message } from "../../types/chat";
import { formatMessageTime } from "../../lib/chat";
import { NoteCitation } from "./NoteCitation";
import { TextWithMentions } from "./NoteMention";
import { useChatStore } from "../../stores/chatStore";

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
}

/**
 * Individual message bubble with citations, edit functionality, and markdown rendering
 */
export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [isHovered, setIsHovered] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const { editMessage, isStreaming: storeIsStreaming } = useChatStore();

  const isUser = message.role === "user";
  const citations = message.metadata?.citations ?? [];
  const canEdit = isUser && !isStreaming && !storeIsStreaming && !message.id.startsWith("temp-");

  // Auto-focus and resize textarea when editing
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [isEditing, editContent]);

  const handleStartEdit = () => {
    setEditContent(message.content);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditContent(message.content);
  };

  const handleSaveEdit = async () => {
    if (editContent.trim() === message.content.trim()) {
      setIsEditing(false);
      return;
    }

    if (editContent.trim()) {
      await editMessage(message.id, editContent.trim());
      setIsEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      handleCancelEdit();
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSaveEdit();
    }
  };

  if (isEditing) {
    return (
      <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
        <div
          className="max-w-[85%] rounded-lg p-3"
          style={{
            backgroundColor: "var(--color-bg-secondary)",
            border: "1px solid var(--color-accent)",
          }}
        >
          <textarea
            ref={textareaRef}
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full min-h-[60px] resize-none rounded bg-transparent text-sm outline-none"
            style={{ color: "var(--color-text-primary)" }}
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              onClick={handleCancelEdit}
              className="rounded px-3 py-1 text-xs font-medium transition-colors hover:bg-[var(--color-bg-hover)]"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Cancel
            </button>
            <button
              onClick={handleSaveEdit}
              disabled={!editContent.trim()}
              className="rounded px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50"
              style={{
                backgroundColor: "var(--color-accent)",
                color: "var(--color-text-inverse)",
              }}
            >
              Save & Regenerate
            </button>
          </div>
          <p
            className="mt-1 text-xs"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            This will regenerate all responses after this message.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`group flex ${isUser ? "justify-end" : "justify-start"}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={`relative max-w-[85%] rounded-lg px-3 py-2 ${
          isUser ? "rounded-br-sm" : "rounded-bl-sm"
        }`}
        style={{
          backgroundColor: isUser
            ? "var(--color-accent)"
            : "var(--color-bg-tertiary)",
          color: isUser
            ? "var(--color-text-inverse)"
            : "var(--color-text-primary)",
        }}
      >
        {/* Edit button for user messages */}
        {canEdit && isHovered && (
          <button
            onClick={handleStartEdit}
            className="absolute -left-8 top-1 rounded p-1 transition-colors hover:bg-[var(--color-bg-hover)]"
            title="Edit message"
          >
            <svg
              className="h-4 w-4"
              style={{ color: "var(--color-text-tertiary)" }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
          </button>
        )}

        {/* Message content with markdown */}
        <div className="text-sm leading-relaxed">
          {isUser ? (
            // User messages: plain text with @mentions rendered as badges
            <div className="whitespace-pre-wrap">
              <TextWithMentions content={message.content} variant="message-user" />
            </div>
          ) : (
            // Assistant messages: render markdown with syntax highlighting
            <MarkdownContent content={message.content} isStreaming={isStreaming} />
          )}
          {isStreaming && (
            <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-current" />
          )}
        </div>

        {/* Citations */}
        {citations.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {citations.map((citation) => (
              <NoteCitation
                key={citation.noteId}
                noteId={citation.noteId}
                noteTitle={citation.noteTitle}
                relevance={citation.relevance}
              />
            ))}
          </div>
        )}

        {/* Timestamp */}
        {!message.id.startsWith("temp-") && (
          <div
            className="mt-1 text-xs opacity-70"
            style={{
              color: isUser
                ? "var(--color-text-inverse)"
                : "var(--color-text-tertiary)",
            }}
          >
            {formatMessageTime(message.createdAt)}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Memoized markdown content renderer
 */
const MarkdownContent = memo(function MarkdownContent({
  content,
  isStreaming,
}: {
  content: string;
  isStreaming?: boolean;
}) {
  return (
    <div className={`markdown-content ${isStreaming ? "streaming" : ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Code blocks with syntax highlighting
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || "");
            const isInline = !match && !String(children).includes("\n");
            
            if (isInline) {
              return (
                <code
                  className="rounded px-1 py-0.5 text-sm"
                  style={{
                    backgroundColor: "var(--color-bg-secondary)",
                    color: "var(--color-accent)",
                  }}
                  {...props}
                >
                  {children}
                </code>
              );
            }
            
            return (
              <div className="my-2 overflow-hidden rounded-lg">
                <SyntaxHighlighter
                  style={oneDark}
                  language={match?.[1] || "text"}
                  PreTag="div"
                  customStyle={{
                    margin: 0,
                    padding: "12px",
                    fontSize: "13px",
                    borderRadius: "8px",
                  }}
                >
                  {String(children).replace(/\n$/, "")}
                </SyntaxHighlighter>
              </div>
            );
          },
          // Paragraphs
          p({ children }) {
            return <p className="mb-2 last:mb-0">{children}</p>;
          },
          // Headers
          h1({ children }) {
            return <h1 className="mb-2 mt-3 text-lg font-bold first:mt-0">{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="mb-2 mt-3 text-base font-bold first:mt-0">{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="mb-1 mt-2 text-sm font-bold first:mt-0">{children}</h3>;
          },
          // Lists
          ul({ children }) {
            return <ul className="mb-2 ml-4 list-disc">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="mb-2 ml-4 list-decimal">{children}</ol>;
          },
          li({ children }) {
            return <li className="mb-1">{children}</li>;
          },
          // Links
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
                style={{ color: "var(--color-accent)" }}
              >
                {children}
              </a>
            );
          },
          // Blockquotes
          blockquote({ children }) {
            return (
              <blockquote
                className="my-2 border-l-2 pl-3 italic"
                style={{
                  borderColor: "var(--color-accent)",
                  color: "var(--color-text-secondary)",
                }}
              >
                {children}
              </blockquote>
            );
          },
          // Tables
          table({ children }) {
            return (
              <div className="my-2 overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">{children}</table>
              </div>
            );
          },
          th({ children }) {
            return (
              <th
                className="border px-2 py-1 text-left font-medium"
                style={{
                  borderColor: "var(--color-border)",
                  backgroundColor: "var(--color-bg-secondary)",
                }}
              >
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td
                className="border px-2 py-1"
                style={{ borderColor: "var(--color-border)" }}
              >
                {children}
              </td>
            );
          },
          // Horizontal rule
          hr() {
            return (
              <hr
                className="my-3"
                style={{ borderColor: "var(--color-border)" }}
              />
            );
          },
          // Strong/Bold
          strong({ children }) {
            return <strong className="font-semibold">{children}</strong>;
          },
          // Emphasis/Italic
          em({ children }) {
            return <em className="italic">{children}</em>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});

export default MessageBubble;
