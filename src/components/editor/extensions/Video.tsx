import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { VideoPlayer } from "../VideoPlayer";

export interface VideoOptions {
  HTMLAttributes: Record<string, unknown>;
  allowBase64: boolean;
}

interface VideoAttributes {
  src: string;
  title?: string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    video: {
      /**
       * Add a video
       */
      setVideo: (options: { src: string; title?: string }) => ReturnType;
    };
  }
}

/**
 * Video extension for TipTap
 * Enables embedding videos with custom playback controls
 */
export const Video = Node.create<VideoOptions>({
  name: "video",

  group: "block",

  atom: true,

  draggable: true,

  addOptions() {
    return {
      HTMLAttributes: {},
      allowBase64: true,
    };
  },

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (element) => element.getAttribute("src"),
        renderHTML: (attributes) => {
          if (!attributes.src) return {};
          return { src: attributes.src };
        },
      },
      title: {
        default: null,
        parseHTML: (element) => element.getAttribute("title"),
        renderHTML: (attributes) => {
          if (!attributes.title) return {};
          return { title: attributes.title };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-video-node="true"]',
        getAttrs: (element) => {
          const video = element.querySelector("video");
          return {
            src: video?.getAttribute("src") || null,
            title: element.getAttribute("data-title") || null,
          };
        },
      },
      {
        tag: "video[src]",
        getAttrs: (element) => ({
          src: element.getAttribute("src"),
          title: element.getAttribute("title"),
        }),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(
        { "data-video-node": "true", class: "video-node" },
        this.options.HTMLAttributes,
        { "data-title": HTMLAttributes.title }
      ),
      ["video", { src: HTMLAttributes.src, controls: true }],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(VideoNodeView);
  },

  addCommands() {
    return {
      setVideo:
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
 * React component for the video node view
 */
function VideoNodeView({ node }: NodeViewProps) {
  const attrs = node.attrs as VideoAttributes;
  return (
    <NodeViewWrapper className="video-node-wrapper">
      <VideoPlayer src={attrs.src} title={attrs.title} />
    </NodeViewWrapper>
  );
}

export default Video;
