# 🤖 AI AGENT MANIFEST: PIBOT Context Guide

This directory contains a **Professional Autonomous Agent Framework**. Use this manifest to quickly gain context and fulfill user requests without extensive research.

--

## 🏗️ Project Architecture Overview
The repository follows a **Clean Root** pattern to keep user data and app binaries separate from source code.

- **`developer/`**: The core source code and build environment. All `npm` and `electron` operations MUST be run from here.
- **`agents/`**: Persistent storage for all user-created AI agents. Each agent has its own folder (e.g. `agents/UX_Auditor/`).
- **`PIBOT.app`**: The compiled macOS binary in the root for direct user access.

--

## 📂 Critical File Map (within `developer/`)

- **`package.json`**: Build scripts (`build:mac`, `build:win`), metadata, and dependencies (`electron`, `node-cron`).
- **`src/main.js`**: Electron Main Process. Handles window lifecycle, System Tray, and OAuth IPC.
- **`src/renderer.js`**: Main UI logic and the **Agent Engine**. Handles chat, cron scheduling, and file context scraping.
- **`src/index.html`** / **`src/style.css`**: The Glassmorphism UI definitions.
- **`scripts/generate_icns.sh`**: Essential for macOS icon generation. Run before building.

--

## 🛠️ Automated Workflows
Standardized procedures are available for common tasks:
- **Location:** `.agent/workflows/` (Root)
- **Rebuild Apps:** `.agent/workflows/rebuild-apps.md`

--

## 🧪 Quick Verification
Before committing changes, run the built-in verification script from `developer/`:
```bash
cd developer && bash scripts/verify_bot.sh
```

---
*Created by PIBOT v1.0. (AI-to-AI Handoff Protocol)*
