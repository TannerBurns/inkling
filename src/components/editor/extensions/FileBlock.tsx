import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { FilePreview } from "../FilePreview";
import type { FileCategory } from "../../../lib/fileTypes";

export interface FileBlockOptions {
  HTMLAttributes: Record<string, unknown>;
}

interface FileBlockAttributes {
  src: string;
  filename: string;
  fileType: FileCategory;
  fileSize?: number;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fileBlock: {
      /**
       * Add a file block
       */
      setFileBlock: (options: {
        src: string;
        filename: string;
        fileType: FileCategory;
        fileSize?: number;
      }) => ReturnType;
    };
  }
}

/**
 * FileBlock extension for TipTap
 * Enables embedding file previews for PDFs, code files, text files, and office documents
 */
export const FileBlock = Node.create<FileBlockOptions>({
  name: "fileBlock",

  group: "block",

  atom: true,

  draggable: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-src"),
        renderHTML: (attributes) => {
          if (!attributes.src) return {};
          return { "data-src": attributes.src };
        },
      },
      filename: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-filename"),
        renderHTML: (attributes) => {
          if (!attributes.filename) return {};
          return { "data-filename": attributes.filename };
        },
      },
      fileType: {
        default: "unknown",
        parseHTML: (element) => element.getAttribute("data-file-type") || "unknown",
        renderHTML: (attributes) => {
          return { "data-file-type": attributes.fileType };
        },
      },
      fileSize: {
        default: null,
        parseHTML: (element) => {
          const size = element.getAttribute("data-file-size");
          return size ? parseInt(size, 10) : null;
        },
        renderHTML: (attributes) => {
          if (!attributes.fileSize) return {};
          return { "data-file-size": attributes.fileSize.toString() };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-file-block="true"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(
        { "data-file-block": "true", class: "file-block-node" },
        this.options.HTMLAttributes,
        HTMLAttributes
      ),
      ["span", { class: "file-block-placeholder" }, HTMLAttributes.filename || "File"],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FileBlockNodeView);
  },

  addCommands() {
    return {
      setFileBlock:
        (options) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: options,
          });
        },
    };
  },
});

/**
 * React component for the file block node view
 */
function FileBlockNodeView({ node }: NodeViewProps) {
  const attrs = node.attrs as FileBlockAttributes;
  return (
    <NodeViewWrapper className="file-block-node-wrapper">
      <FilePreview
        src={attrs.src}
        filename={attrs.filename}
        fileType={attrs.fileType}
        fileSize={attrs.fileSize}
      />
    </NodeViewWrapper>
  );
}

export default FileBlock;
