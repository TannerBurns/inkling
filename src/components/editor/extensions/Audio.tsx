import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { AudioPlayer } from "../AudioPlayer";

export interface AudioOptions {
  HTMLAttributes: Record<string, unknown>;
  allowBase64: boolean;
}

interface AudioAttributes {
  src: string;
  title?: string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    audio: {
      /**
       * Add an audio file
       */
      setAudio: (options: { src: string; title?: string }) => ReturnType;
    };
  }
}

/**
 * Audio extension for TipTap
 * Enables embedding audio files with custom playback controls
 */
export const audio = Node.create<AudioOptions>({
  name: "audio",

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
        tag: 'div[data-audio-node="true"]',
        getAttrs: (element) => {
          const audio = element.querySelector("audio");
          return {
            src: audio?.getAttribute("src") || null,
            title: element.getAttribute("data-title") || null,
          };
        },
      },
      {
        tag: "audio[src]",
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
        { "data-audio-node": "true", class: "audio-node" },
        this.options.HTMLAttributes,
        { "data-title": HTMLAttributes.title }
      ),
      ["audio", { src: HTMLAttributes.src, controls: true }],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AudioNodeView);
  },

  addCommands() {
    return {
      setAudio:
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
 * React component for the audio node view
 */
function AudioNodeView({ node }: NodeViewProps) {
  const attrs = node.attrs as AudioAttributes;
  return (
    <NodeViewWrapper className="audio-node-wrapper">
      <AudioPlayer src={attrs.src} title={attrs.title} />
    </NodeViewWrapper>
  );
}

export default audio;
