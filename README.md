# PIBOT / GeminiBot

PIBOT is a local Electron desktop app for managing simple autonomous agents from a tray-style interface. This repository contains:

- `PIBOT.app/`: a packaged macOS build already exported in the repo.
- `agents/`: the runtime workspace where each agent keeps its own folder and config.
- `developer/`: the editable Electron source, assets, scripts, and build configuration.
- `pibot.sh`: a small CLI wrapper around the developer CLI.

## Current State

The project is partially productized and partially prototype:

- The desktop UI, project scanner, agent list, forms, and tray integration are implemented.
- Agents are discovered from `agents/*` and can be launched manually from the UI or CLI.
- Agent execution now runs through `developer/src/agent_handler.js`, which combines local project heuristics with the selected model runtime when available.
- Google OAuth is wired through `developer/src/oauth.js`.
- `FREE BIRD` mode is available in settings with support for local Ollama runtimes and self-hosted OpenAI-compatible endpoints.
- Cron scheduling can execute agents when Autonomous Mode is enabled.
- Persistence is handled with browser `localStorage`, not a database.

## Quick Start

### Run the packaged app

Open `PIBOT.app` on macOS.

### Run from source

```bash
cd developer
npm install
npm start
```

### Use the CLI

```bash
./pibot.sh --help
./pibot.sh agents list
./pibot.sh agents wake Folder_Maker
```

## Project Layout

```text
.
├── PIBOT.app/                 # Bundled macOS app
├── agents/                    # Agent folders and persistent files
│   ├── <AgentName>/agent.json
│   ├── <AgentName>/skills.md
│   └── <AgentName>/memory.md
├── developer/
│   ├── src/                   # Electron main/renderer source
│   ├── scripts/               # Validation, build, and CLI helpers
│   ├── assets/                # Icons and brand assets
│   ├── README.md
│   └── ARCHITECTURE.md
└── pibot.sh                   # CLI entrypoint
```

## Important Files

- `developer/src/main.js`: Electron main process, tray setup, IPC handlers, shell execution bridge.
- `developer/src/renderer.js`: UI state, local persistence, FREE BIRD settings, agent discovery, project scanning, cron execution, zen mode.
- `developer/src/agent_handler.js`: runtime that gathers project context and calls the active provider.
- `developer/src/model_runtime.js`: provider layer for Ollama, OpenAI-compatible endpoints, and runtime actions.
- `developer/src/oauth.js`: Google OAuth implementation used by the app.
- `developer/scripts/pibot.js`: CLI for listing, creating, waking, validating, and building agents.

## Documentation

- [Developer README](developer/README.md)
- [Architecture Guide](developer/ARCHITECTURE.md)
- [Distribution Guide](developer/DISTRIBUTION.md)
- [Release Notes](developer/RELEASE_NOTES.md)
- [AI Agent Manifest](developer/AI_AGENT_MANIFEST.md)

## Notes

The project still has open gaps around cloud generation, richer memory workflows, and shell-action review, but the local runtime path is now concrete enough to evolve from.
