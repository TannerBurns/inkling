import { Extension, type Editor, type Range } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import Suggestion, { type SuggestionProps, type SuggestionKeyDownProps } from "@tiptap/suggestion";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import { PluginKey } from "@tiptap/pm/state";
import { forwardRef, useEffect, useImperativeHandle, useState, useCallback } from "react";
import {
  Sparkles,
  Image,
  GitBranch,
  Search,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Code,
  Minus,
  GitMerge,
  Table,
} from "lucide-react";

export interface SlashCommandOptions {
  suggestion: Partial<typeof Suggestion>;
}

interface CommandItem {
  id: string;
  title: string;
  description: string;
  icon: typeof Sparkles;
  category: "ai" | "basic" | "media";
  command: (editor: Editor, range: Range) => void;
}

const AI_COMMANDS: CommandItem[] = [
  {
    id: "ask-ai",
    title: "Ask AI",
    description: "Get help with research, writing, or any question",
    icon: Sparkles,
    category: "ai",
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).insertAIBlock().run();
    },
  },
  {
    id: "search-notes",
    title: "Search Notes",
    description: "Find relevant information in your notes",
    icon: Search,
    category: "ai",
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).insertAIBlock().run();
    },
  },
  {
    id: "create-diagram",
    title: "Create Diagram",
    description: "Generate a flowchart, sequence diagram, or other visual",
    icon: GitBranch,
    category: "ai",
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).insertAIBlock().run();
    },
  },
  {
    id: "find-image",
    title: "Find Image",
    description: "Search for a relevant image to add",
    icon: Image,
    category: "ai",
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).insertAIBlock().run();
    },
  },
];

const BASIC_COMMANDS: CommandItem[] = [
  {
    id: "text",
    title: "Text",
    description: "Just start typing with plain text",
    icon: FileText,
    category: "basic",
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).run();
    },
  },
  {
    id: "heading1",
    title: "Heading 1",
    description: "Large section heading",
    icon: Heading1,
    category: "basic",
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run();
    },
  },
  {
    id: "heading2",
    title: "Heading 2",
    description: "Medium section heading",
    icon: Heading2,
    category: "basic",
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run();
    },
  },
  {
    id: "heading3",
    title: "Heading 3",
    description: "Small section heading",
    icon: Heading3,
    category: "basic",
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run();
    },
  },
  {
    id: "bullet-list",
    title: "Bullet List",
    description: "Create a simple bullet list",
    icon: List,
    category: "basic",
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    id: "numbered-list",
    title: "Numbered List",
    description: "Create a numbered list",
    icon: ListOrdered,
    category: "basic",
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  {
    id: "task-list",
    title: "Task List",
    description: "Create a checklist with checkboxes",
    icon: CheckSquare,
    category: "basic",
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run();
    },
  },
  {
    id: "quote",
    title: "Quote",
    description: "Capture a quote",
    icon: Quote,
    category: "basic",
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run();
    },
  },
  {
    id: "code",
    title: "Code Block",
    description: "Capture a code snippet",
    icon: Code,
    category: "basic",
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
    },
  },
  {
    id: "divider",
    title: "Divider",
    description: "Visually divide blocks",
    icon: Minus,
    category: "basic",
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run();
    },
  },
  {
    id: "table",
    title: "Table",
    description: "Insert a 3x3 table (use toolbar to resize)",
    icon: Table,
    category: "basic",
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    },
  },
];

const MEDIA_COMMANDS: CommandItem[] = [
  {
    id: "mermaid",
    title: "Mermaid Diagram",
    description: "Insert a flowchart, sequence diagram, or other diagram",
    icon: GitMerge,
    category: "media",
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).setMermaidBlock().run();
    },
  },
];

const ALL_COMMANDS = [...AI_COMMANDS, ...MEDIA_COMMANDS, ...BASIC_COMMANDS];

/**
 * SlashCommand extension for TipTap
 * Shows a command menu when typing / at the start of a line
 */
export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: "slashCommand",

  addOptions() {
    return {
      suggestion: {
        char: "/",
        pluginKey: new PluginKey("slashCommand"),
        allowSpaces: false,
        startOfLine: true,
        command: ({ editor, range, props }: { editor: Editor; range: Range; props: CommandItem }) => {
          props.command(editor, range);
        },
        items: ({ query }: { query: string }) => {
          const search = query.toLowerCase();
          return ALL_COMMANDS.filter(
            (item) =>
              item.title.toLowerCase().includes(search) ||
              item.description.toLowerCase().includes(search)
          );
        },
        render: () => {
          let component: ReactRenderer<SlashCommandListRef> | null = null;
          let popup: TippyInstance[] | null = null;

          return {
            onStart: (props: SuggestionProps) => {
              component = new ReactRenderer(SlashCommandList, {
                props,
                editor: props.editor,
              });

              if (!props.clientRect) {
                return;
              }

              popup = tippy("body", {
                getReferenceClientRect: props.clientRect as () => DOMRect,
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: "manual",
                placement: "bottom-start",
                maxWidth: "320px",
              });
            },

            onUpdate(props: SuggestionProps) {
              component?.updateProps(props);

              if (!props.clientRect || !popup) {
                return;
              }

              popup[0]?.setProps({
                getReferenceClientRect: props.clientRect as () => DOMRect,
              });
            },

            onKeyDown(props: SuggestionKeyDownProps) {
              if (props.event.key === "Escape") {
                popup?.[0]?.hide();
                return true;
              }

              return component?.ref?.onKeyDown(props) ?? false;
            },

            onExit() {
              popup?.[0]?.destroy();
              component?.destroy();
              popup = null;
              component = null;
            },
          };
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});

interface SlashCommandListRef {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

interface SlashCommandListProps extends SuggestionProps {
  items: CommandItem[];
  command: (item: CommandItem) => void;
}

const SlashCommandList = forwardRef<SlashCommandListRef, SlashCommandListProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    const selectItem = useCallback(
      (index: number) => {
        const item = items[index];
        if (item) {
          command(item);
        }
      },
      [items, command]
    );

    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: SuggestionKeyDownProps) => {
        if (event.key === "ArrowUp") {
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
          return true;
        }

        if (event.key === "ArrowDown") {
          setSelectedIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
          return true;
        }

        if (event.key === "Enter") {
          selectItem(selectedIndex);
          return true;
        }

        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div
          className="rounded-lg border p-3 shadow-lg"
          style={{
            backgroundColor: "var(--color-bg-primary)",
            borderColor: "var(--color-border)",
          }}
        >
          <p
            className="text-sm"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            No results
          </p>
        </div>
      );
    }

    // Group items by category
    const aiItems = items.filter((item) => item.category === "ai");
    const mediaItems = items.filter((item) => item.category === "media");
    const basicItems = items.filter((item) => item.category === "basic");

    return (
      <div
        className="max-h-80 overflow-y-auto rounded-lg border shadow-lg"
        style={{
          backgroundColor: "var(--color-bg-primary)",
          borderColor: "var(--color-border)",
          minWidth: "280px",
        }}
      >
        {/* AI Commands */}
        {aiItems.length > 0 && (
          <>
            <div
              className="px-3 py-2 text-xs font-semibold uppercase tracking-wider"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              AI Assistant
            </div>
            {aiItems.map((item) => {
              const globalIndex = items.indexOf(item);
              return (
                <CommandButton
                  key={item.id}
                  item={item}
                  isSelected={globalIndex === selectedIndex}
                  onClick={() => selectItem(globalIndex)}
                  onMouseEnter={() => setSelectedIndex(globalIndex)}
                />
              );
            })}
          </>
        )}

        {/* Media Commands */}
        {mediaItems.length > 0 && (
          <>
            <div
              className="px-3 py-2 text-xs font-semibold uppercase tracking-wider"
              style={{
                color: "var(--color-text-tertiary)",
                borderTop: aiItems.length > 0 ? "1px solid var(--color-border)" : undefined,
              }}
            >
              Media
            </div>
            {mediaItems.map((item) => {
              const globalIndex = items.indexOf(item);
              return (
                <CommandButton
                  key={item.id}
                  item={item}
                  isSelected={globalIndex === selectedIndex}
                  onClick={() => selectItem(globalIndex)}
                  onMouseEnter={() => setSelectedIndex(globalIndex)}
                />
              );
            })}
          </>
        )}

        {/* Basic Commands */}
        {basicItems.length > 0 && (
          <>
            <div
              className="px-3 py-2 text-xs font-semibold uppercase tracking-wider"
              style={{
                color: "var(--color-text-tertiary)",
                borderTop: (aiItems.length > 0 || mediaItems.length > 0) ? "1px solid var(--color-border)" : undefined,
              }}
            >
              Basic Blocks
            </div>
            {basicItems.map((item) => {
              const globalIndex = items.indexOf(item);
              return (
                <CommandButton
                  key={item.id}
                  item={item}
                  isSelected={globalIndex === selectedIndex}
                  onClick={() => selectItem(globalIndex)}
                  onMouseEnter={() => setSelectedIndex(globalIndex)}
                />
              );
            })}
          </>
        )}
      </div>
    );
  }
);

SlashCommandList.displayName = "SlashCommandList";

function CommandButton({
  item,
  isSelected,
  onClick,
  onMouseEnter,
}: {
  item: CommandItem;
  isSelected: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
}) {
  const Icon = item.icon;

  return (
    <button
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left transition-colors"
      style={{
        backgroundColor: isSelected ? "var(--color-bg-hover)" : "transparent",
      }}
    >
      <div
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
        style={{
          backgroundColor:
            item.category === "ai"
              ? "var(--color-accent-light)"
              : "var(--color-bg-secondary)",
          color:
            item.category === "ai"
              ? "var(--color-accent)"
              : "var(--color-text-tertiary)",
        }}
      >
        <Icon size={16} />
      </div>
      <div className="flex-1 overflow-hidden">
        <div
          className="truncate text-sm font-medium"
          style={{ color: "var(--color-text-primary)" }}
        >
          {item.title}
        </div>
        <div
          className="truncate text-xs"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          {item.description}
        </div>
      </div>
    </button>
  );
}

export default SlashCommand;
