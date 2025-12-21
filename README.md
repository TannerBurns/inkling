<p align="center">
  <img src="public/inkling.png" alt="Inkling Logo" width="120" height="120" />
</p>

<h1 align="center">Inkling</h1>

<p align="center">
  <strong>AI-powered note-taking that connects your thoughts</strong>
</p>

<p align="center">
  <a href="https://github.com/TannerBurns/inkling/releases/latest">
    <img src="https://img.shields.io/github/v/release/TannerBurns/inkling?include_prereleases&label=beta&color=7c3aed" alt="Beta Release" />
  </a>
  <a href="https://github.com/TannerBurns/inkling/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/TannerBurns/inkling?color=7c3aed" alt="License" />
  </a>
  <img src="https://img.shields.io/badge/platforms-macOS%20%7C%20Windows%20%7C%20Linux-7c3aed" alt="Platforms" />
</p>

<p align="center">
  <a href="#-download">Download</a> •
  <a href="#-features">Features</a> •
  <a href="#-screenshots">Screenshots</a> •
  <a href="#%EF%B8%8F-ai-providers">AI Providers</a> •
  <a href="#-development">Development</a> •
  <a href="#-roadmap">Roadmap</a>
</p>

---

## 🚀 Download

### Beta Release

> ⚠️ **Beta Software** - Inkling is in active development. Some features may be incomplete and you may encounter bugs.

| Platform | Download |
|----------|----------|
| **macOS** (Universal) | [Inkling.dmg](https://github.com/TannerBurns/inkling/releases/latest) |
| **Windows** | [Inkling-Setup.exe](https://github.com/TannerBurns/inkling/releases/latest) |
| **Linux** | [Inkling.AppImage](https://github.com/TannerBurns/inkling/releases/latest) |

---

## ✨ Features

### 📝 Rich Note-Taking
- Beautiful, distraction-free editor powered by TipTap
- Full Markdown support with live preview
- Wiki-style `[[note linking]]` between notes
- Hierarchical folder organization
- Task lists, tables, code blocks, and more

### 🔍 Intelligent Search
- **Full-text search** - Find notes instantly with Tantivy-powered search
- **Semantic search** - Discover notes by meaning, not just keywords
- **Hybrid mode** - Combine both for the best results

### 🔗 Smart Connections
- **Related Notes** - AI discovers semantically similar notes
- **Backlinks** - See all notes that link to the current note
- Automatic link suggestions while you write

### 🕸️ Knowledge Graph
- **Interactive visualization** - See your notes and their connections as a network
- **Dual edge types** - View wiki links and/or semantic similarity connections
- **Smart filtering** - Filter by folder, time range, or similarity threshold
- **Adaptive sizing** - Nodes scale based on connection count
- **Quick access** - Double-click any node to open the note

### 📅 Calendar
- **Multiple views** - Day, week, and month views for flexible planning
- **Event management** - Create, edit, and delete events with ease
- **Recurring events** - Daily, weekly, monthly, and yearly recurrence support
- **Note linking** - Connect events directly to your notes
- **Quick navigation** - Jump to today or browse any date range

### 💬 Chat with Your Notes
- Ask questions and get answers from your knowledge base
- RAG (Retrieval-Augmented Generation) powered responses
- Multi-turn conversations with context retention
- `@mention` specific notes to add them as context
- AI-generated conversation titles
- Real-time streaming responses with Markdown rendering

### 🎯 Modern Interface
- **Split view editor** - Work on multiple notes side-by-side
- **Resizable panels** - Customize your workspace
- **Keyboard-first** - Navigate entirely with shortcuts
- **Focus mode** - Hide all panels to concentrate on writing
- **Dark/Light themes** - Follows your system preference

### 🔒 Privacy-First
- **Local-first** - All your notes stay on your device
- **No account required** - Get started immediately
- **Your data, your control** - Use local AI models for complete privacy

### 🤖 Flexible AI
- Use cloud providers (OpenAI, Anthropic, Google) for power
- Use local models (Ollama, LMStudio) for privacy
- Automatic fallback when providers are unavailable
- Per-task model selection

---

## 🖼️ Screenshots

*Coming soon*

---

## 🤖 AI Providers

Inkling uses a unified AI gateway to connect to multiple providers seamlessly.

### Cloud Providers

| Provider | Models | Best For |
|----------|--------|----------|
| **OpenAI** | GPT | General purpose, fast responses |
| **Anthropic** | Claude  | Long context, nuanced responses |
| **Google** | Gemini | Large context windows |

### Local Providers (First-Class Support)

| Provider | Setup | Notes |
|----------|-------|-------|
| **Ollama** | `ollama serve` | Easy setup, many models available |
| **LMStudio** | GUI application | User-friendly, built-in model browser |
| **VLLM** | Docker/Python | Production-ready, high throughput |

---

## 🏗️ Architecture

Inkling is built with performance and privacy in mind:

```
┌──────────────────────────────────────────────────────────────────────────┐
│                       Frontend (React + TypeScript)                       │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────┐ │
│  │   TipTap   │ │  Chat UI   │ │ Knowledge  │ │  Calendar  │ │ Kanban │ │
│  │   Editor   │ │            │ │   Graph    │ │    View    │ │ Boards │ │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘ └────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
                                     │
                                     │ Tauri IPC
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                            Backend (Rust)                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   SQLite     │  │   Tantivy    │  │  AI Gateway  │  │   Calendar   │ │
│  │  + Vectors   │  │   Search     │  │   (Bifrost)  │  │    Events    │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

- **Frontend**: React 19, TypeScript, TailwindCSS 4, TipTap, ReactFlow
- **Backend**: Tauri 2, Rust
- **Database**: SQLite with vector extensions (sqlite-vec)
- **Search**: Tantivy (Rust's Lucene equivalent)
- **AI Gateway**: Unified interface for all LLM providers
- **State Management**: Zustand

### Why Tauri?

- **Tiny** - ~15MB vs ~200MB for Electron
- **Fast** - Native Rust performance
- **Secure** - Rust's memory safety guarantees
- **Cross-platform** - Single codebase for all platforms

---

## 🛠️ Development

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Rust](https://rustup.rs/) (latest stable)
- [Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/)

### Quick Start

```bash
# Clone the repository
git clone https://github.com/TannerBurns/inkling.git
cd inkling

# Install dependencies
npm install

# Run in development mode
npm run tauri dev
```

### Build

```bash
# Build for current platform
npm run build:current

# Platform-specific builds
npm run build:mac     # macOS Universal
npm run build:win     # Windows x64
npm run build:linux   # Linux x64
```

---

## ⌨️ Keyboard Shortcuts

| Action | macOS | Windows/Linux |
|--------|-------|---------------|
| New note | `⌘N` | `Ctrl+N` |
| New daily note | `⌘D` | `Ctrl+D` |
| Global search | `⌘K` | `Ctrl+K` |
| Toggle chat panel | `⌘⇧C` | `Ctrl+Shift+C` |
| Toggle left sidebar | `⌘[` | `Ctrl+[` |
| Toggle right sidebar | `⌘]` | `Ctrl+]` |
| Open knowledge graph | `⌘G` | `Ctrl+G` |
| Open calendar | `⌘⇧D` | `Ctrl+Shift+D` |
| Open settings | `⌘,` | `Ctrl+,` |

---

## 🤝 Contributing

Contributions are welcome! Whether it's bug reports, feature requests, or code contributions.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

[MIT License](./LICENSE)

---

<p align="center">
  <sub>Built with ❤️ using Tauri, React, and Rust</sub>
</p>
