# PIBOT Developer Guide

This folder contains the editable Electron application behind PIBOT.

## What Is Here

- `src/`: Electron source code for the main process, renderer, OAuth helper, HTML, and CSS.
- `scripts/`: local tooling for validation, diagnostics, builds, and CLI access.
- `assets/`: icons and brand source files.
- `package.json`: Electron and electron-builder configuration.

## Run From Source

```bash
cd developer
npm install
npm start
```

## Build

```bash
cd developer
bash scripts/generate_icns.sh
npm run build:mac
npm run build:win
```

## Important Files

- [src/main.js](src/main.js): menubar boot, tray behavior, IPC, agent execution bridge.
- [src/renderer.js](src/renderer.js): UI state, FREE BIRD settings, persistence, discovery, scheduling, project scanning, zen mode.
- [src/agent_handler.js](src/agent_handler.js): agent runtime that combines local diagnostics with the configured provider.
- [src/model_runtime.js](src/model_runtime.js): provider layer for Ollama and OpenAI-compatible runtimes.
- [src/oauth.js](src/oauth.js): real Google OAuth implementation.

## Read This First

- [ARCHITECTURE.md](ARCHITECTURE.md): honest technical map of the current implementation.
- [AI_AGENT_MANIFEST.md](AI_AGENT_MANIFEST.md): compact repo handoff context.
- [DISTRIBUTION.md](DISTRIBUTION.md): packaging and release notes.
- [RELEASE_NOTES.md](RELEASE_NOTES.md): version-by-version product updates.

## Current Caveats

- Google OAuth is real, but Google model generation is not wired yet.
- `FREE BIRD` depends on having a local runtime available, typically Ollama.
- agent state and settings are still persisted in `localStorage`.
