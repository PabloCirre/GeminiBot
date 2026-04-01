# PIBOT Architecture Guide

## Overview

PIBOT is an Electron menubar application that manages local "agents" stored as folders on disk. The current execution path is:

1. The renderer loads agent and project metadata from `localStorage`.
2. It discovers additional agent folders inside `/agents`.
3. The user selects a provider in Settings: Google Cloud, local Ollama, or a self-hosted OpenAI-compatible endpoint.
4. A user wakes an agent from the UI or an autonomous cron schedule triggers it.
5. The main process executes `developer/src/agent_handler.js` through Electron's embedded Node runtime.
6. The handler gathers directory heuristics and file context.
7. If a live provider is available, the handler asks the active model for analysis.
8. The renderer stores the report as the agent's latest output and surfaces it in the UI.

## Runtime Architecture

### Main process

File: [main.js](src/main.js)

Responsibilities:

- boots the menubar app with a transparent frameless browser window
- configures tray behavior and the right-click context menu
- exposes IPC handlers for:
  - hiding/quitting the app
  - OAuth login and refresh
  - folder selection dialogs
  - provider status, install, remove, and model listing actions
  - agent execution
  - arbitrary shell command execution

Important implementation detail:

- `main.js` imports `./oauth.js` directly.
- provider-specific runtime operations are centralized in `src/model_runtime.js`.

### Renderer process

File: [renderer.js](src/renderer.js)

Responsibilities:

- manages panel navigation between Projects, Agents, and Settings
- persists settings, agents, and project contexts in `localStorage`
- manages the `FREE BIRD` provider UI and provider verification flow
- discovers local agents from `/agents/*/agent.json`
- renders grouped agent cards and project cards
- opens the create/edit agent form
- triggers agent execution over IPC
- registers cron schedules with `node-cron`
- drives Zen Mode, the floating bot overlay

State stored in `localStorage`:

- `pibot_agents`
- `pibot_projects`
- `pibot_model_config`
- `pibot_system`
- `oauth_client_id`
- `oauth_client_secret`
- `oauth_access_token`
- `oauth_refresh_token`

Important implementation details:

- `scheduleAllAgents()` validates cron expressions and calls `runAgent(agent)` when Autonomous Mode is enabled.
- `discoverLocalAgents()` syncs some values from `agent.json`, but agent state like `lastOutput` remains UI-local.
- first-run behavior seeds demo agents if no saved agents exist.

### Agent handler

File: [agent_handler.js](src/agent_handler.js)

Current behavior:

- validates that the target path exists and is a directory
- gathers local heuristics such as project markers and large files
- walks a bounded subset of the directory tree
- reads previews from likely text files
- builds a project-aware prompt for the active model provider
- returns structured JSON with findings, provider info, and model output when available

Current limitations:

- there is no memory writeback
- there is no shell proposal / review loop
- Google generation is still not wired, so cloud mode is configuration-only today

### OAuth module

File: [oauth.js](src/oauth.js)

This file contains a real local-loopback Google OAuth 2.0 implementation:

- starts a temporary HTTP server on `127.0.0.1:3000`
- opens the user's browser to Google's consent screen
- exchanges the authorization code for tokens
- supports token refresh

Status:

- implemented and used by `main.js`

### Provider runtime layer

File: [model_runtime.js](src/model_runtime.js)

This module centralizes model-provider behavior:

- normalizes model configuration shared by renderer, main, and handler
- verifies local Ollama availability
- starts or installs Ollama through Homebrew when requested
- lists local models
- installs and removes Ollama models
- calls Ollama's `/api/generate`
- calls self-hosted OpenAI-compatible `/chat/completions`

## UI Structure

Files:

- [index.html](src/index.html)
- [style.css](src/style.css)

Main panels:

- Projects panel: scans a root folder for codebases using simple markers like `.git`, `package.json`, or `requirements.txt`
- Settings panel: switches between cloud and `FREE BIRD`, manages providers, verifies runtimes, manages models, and stores system instructions
- Agents panel: lists agents by group, exposes wake/edit/delete/log actions, and opens deploy/log overlays

Special mode:

- Zen Mode renders floating agent avatars with speech bubbles containing the latest known output

## Data Model

### Agent folder

Expected examples under [agents](../agents):

- `agent.json`
- `skills.md`
- `memory.md`

Observed schema in `agent.json` is flexible rather than enforced. Common fields:

```json
{
  "name": "Folder Maker Bot",
  "group": "Proof of Work",
  "cron": "* * * * *",
  "prompt": "Crea una carpeta llamada 'BOT_SUCCESS_PROOF'..."
}
```

The renderer also adds UI-local fields such as:

- `id`
- `folder`
- `lastOutput`
- `hasUnreadOutput`
- `color`

### Project context

Project contexts are generated from scanned folders and stored only in `localStorage`:

```json
{
  "id": "proj_...",
  "name": "GeminiBot",
  "path": "/absolute/path"
}
```

## CLI and Scripts

### CLI wrapper

File: [pibot.sh](../pibot.sh)

This forwards commands to [pibot.js](scripts/pibot.js).

Available commands:

- `status`
- `agents list`
- `agents wake <id>`
- `agents new <id>`
- `doctor`
- `build`

### Utility scripts

Files in [scripts](scripts):

- `generate_icns.sh`: builds `build/icon.icns` from `assets/icon.png`
- `validate_project.sh`: checks JS syntax, core file presence, and `node_modules`
- `verify_bot.sh`: creates a health-check agent folder and a diagnostic report
- `test_all_agents.sh`: executes the handler against every agent folder
- `mock_agent_test.js`: UI simulation script for DevTools

## Build and Packaging

File: [package.json](package.json)

Tech stack:

- Electron `^33.2.0`
- electron-builder `^24.13.3`
- menubar `^9.5.2`
- node-cron `^4.2.1`

Main scripts:

```bash
npm start
npm run build:mac
npm run build:win
npm run build:all
```

Build notes:

- macOS build expects `build/icon.icns`
- the builder excludes `dist`, `build`, and `scripts` from packaged app files
- a prebuilt `PIBOT.app` is committed at repo root

## Gaps Between Vision and Implementation

These are the main places where the repository narrative is still ahead of the code:

1. Google OAuth is real, but Google generation itself is not yet wired.
2. Memory persistence is not integrated into the agent execution loop.
3. The shell bridge exists as generic IPC but not as a reviewed agent action pipeline.
4. Agent outputs still live primarily in `localStorage`.
5. CLI execution still calls the handler directly and does not yet consume the GUI model configuration.

## Good Next Steps

If this project is going to keep evolving, the highest-leverage tasks are:

1. Wire Google cloud generation into the provider layer.
2. Define and validate a stable `agent.json` schema.
3. Decide whether agent state should live in files, `localStorage`, or both.
4. Add memory writeback per agent folder.
5. Add a reviewed shell-action workflow on top of model outputs.
