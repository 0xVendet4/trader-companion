# Perssua — Documentation Index

## Architecture
- [Overview](architecture/overview.md) — Two-process model, state management, dev vs. prod loading
- [IPC Handlers](architecture/ipc-handlers.md) — All IPC domains + window.electronAPI surface

## Feature Specs
- [AI Providers](specs/ai-providers.md) — OpenAI, Codex, Gemini, OpenRouter, Custom API, Local LLM; dispatch flow, compaction
- [Transcription](specs/transcription.md) — 4 engines, dual audio, compaction, lifecycle on submit
- [Session Lifecycle](specs/session-lifecycle.md) — DB schema, session create/end, history, continuation, TLDR
- [MCP & Integrations](specs/mcp-integrations.md) — MCP framework, Google OAuth, Obsidian
- [Features](specs/features.md) — Notch insights, Select-to-Prompt, Screen capture, Assistants, Stealth, Click-through, Translation, Auto-update, i18n

## Data Models
- [Data Models](data-models.md) — localStorage keys, settingsStore, appConfig flags, SQLite schema
