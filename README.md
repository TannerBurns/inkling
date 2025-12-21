<p align="center">
  <img src="public/inkling.png" alt="Inkling Logo" width="120" height="120" />
</p>

<h1 align="center">Inkling</h1>

<p align="center">
  <strong>AI-powered note-taking that connects your thoughts</strong>
</p>

<p align="center">
  <a href="https://github.com/tanner/inkling/releases/latest">
    <img src="https://img.shields.io/github/v/release/tanner/inkling?include_prereleases&label=beta&color=7c3aed" alt="Beta Release" />
  </a>
  <a href="https://github.com/tanner/inkling/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/tanner/inkling?color=7c3aed" alt="License" />
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
| **macOS** (Universal) | [Inkling.dmg](https://github.com/tanner/inkling/releases/latest) |
| **Windows** | [Inkling-Setup.exe](https://github.com/tanner/inkling/releases/latest) |
| **Linux** | [Inkling.AppImage](https://github.com/tanner/inkling/releases/latest) |

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
| **llama.cpp** | Direct binary | Maximum control, minimal overhead |

### Recommended Local Models

| Use Case | Model | Notes |
|----------|-------|-------|
| **Chat** | Llama 3 8B | Good balance of quality and speed |
| **Embeddings** | nomic-embed-text | Excellent for semantic search |
| **Fast tasks** | Phi-3 Mini | Quick responses, smaller footprint |

---

## 🏗️ Architecture

Inkling is built with performance and privacy in mind:

```
┌────────────────────────────────────────────────────────────┐
│                    Frontend (React + TypeScript)           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │   TipTap     │  │   Chat UI    │  │  Related Notes   │ │
│  │   Editor     │  │              │  │   & Backlinks    │ │
│  └──────────────┘  └──────────────┘  └──────────────────┘ │
└────────────────────────────────────────────────────────────┘
                              │
                              │ Tauri IPC
                              ▼
┌────────────────────────────────────────────────────────────┐
│                    Backend (Rust)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │   SQLite     │  │   Tantivy    │  │   AI Gateway     │ │
│  │   + Vectors  │  │   Search     │  │   (Bifrost)      │ │
│  └──────────────┘  └──────────────┘  └──────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

- **Frontend**: React 19, TypeScript, TailwindCSS 4, TipTap
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
git clone https://github.com/tanner/inkling.git
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

### Project Structure

```
inkling/
├── src/                    # React frontend
│   ├── components/         # UI components
│   │   ├── editor/         # TipTap editor
│   │   ├── chat/           # Chat interface
│   │   ├── notes/          # Note management
│   │   ├── search/         # Search UI
│   │   └── settings/       # Settings modal
│   ├── hooks/              # React hooks
│   ├── stores/             # Zustand stores
│   └── lib/                # Utilities
├── src-tauri/              # Rust backend
│   └── src/
│       ├── ai/             # AI integration
│       ├── commands/       # Tauri commands
│       ├── db/             # Database layer
│       ├── search/         # Tantivy search
│       └── vault/          # Vault management
└── ...
```

---

## 🗺️ Roadmap

### Completed ✅

- [x] **Phase 1: Foundation** - Note-taking with rich editor
- [x] **Phase 2: AI Integration** - Multi-provider AI support
- [x] **Phase 3: Semantic Search** - Embeddings, vector search, wiki-links
- [x] **Phase 4: Chat Interface** - RAG-powered chat with notes
- [x] **Phase 4.5: UI Polish** - Header bar, panel toggles, keyboard shortcuts

### In Progress 🚧

- [ ] **Phase 5: AI Agents** - Proactive connection discovery, research agent
- [ ] **Phase 6: Knowledge Graph** - Visual exploration of note relationships

### Planned 📋

- [ ] **Phase 7: Production Polish** - Performance, cross-platform testing, auto-updates
- [ ] Import/Export (Obsidian, Notion, Markdown)
- [ ] Note templates
- [ ] Tags and advanced filtering
- [ ] Mobile apps (iOS, Android)

---

## ⌨️ Keyboard Shortcuts

| Action | macOS | Windows/Linux |
|--------|-------|---------------|
| Toggle chat panel | `⌘⇧C` | `Ctrl+Shift+C` |
| Toggle left sidebar | `⌘[` | `Ctrl+[` |
| Toggle right sidebar | `⌘]` | `Ctrl+]` |
| Global search | `⌘K` | `Ctrl+K` |
| New note | `⌘N` | `Ctrl+N` |

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
