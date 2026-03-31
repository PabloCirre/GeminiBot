# 🤖 GeminiBot: Autonomous Agent Framework

GeminiBot is a professional, high-performance desktop application built with Electron. It serves as a sophisticated orchestration layer for Google's Gemini 2.0 models, enabling both real-time AI assistance and long-running autonomous coding agents with persistent cross-session memory.

---

## 🌟 Core Features

### 1. 🧠 Multi-File Codebase Context
GeminiBot can ingest entire project directories. By selecting a local folder, the application recursively scrapes your codebase (respecting `.gitignore` conventions), providing the LLM with a 1:1 map of your project for debugging, refactoring, or auditing.

### 2. 🔐 Native OAuth 2.0 Flow
Forget manual API key pasting. GeminiBot implements a full, secure OAuth 2.0 flow:
- **Local Proxy Server:** Spawns a temporary NodeJS bridge to handle the Google Cloud handshake.
- **Persistent Sessions:** Automatically manages and refreshes access tokens using encrypted local storage.
- **Cloud Console Integration:** Designed to work directly with your Google Cloud "Generative Language API" projects.

### 3. 🤖 Autonomous Agents (Codex-Style)
The crown jewel of GeminiBot is its background agent engine powered by `node-cron`:
- **Scheduled Tasks:** Create agents that wake up on a specific schedule (e.g., nightly at 3 AM) to perform recurring codebase audits.
- **Continuous Memory (`<AGENT_MEMORY>`):** Agents use a specialized tagging system to write their progress to disk. When an agent wakes up for its next shift, it automatically "remembers" exactly where it left off by reading its previous state.
- **MD Reporting:** Every agent execution generates a clean, readable Markdown report within the target project folder.

---

## 📁 Project Structure

```text
GeminiBot/
├── assets/             # Branding, Icons, and Tray templates
├── main.js             # Electron Main Process (Window & IPC)
├── renderer.js         # UI Logic & Agent Orchestration
├── oauth.js            # OAuth 2.0 Server & Token Management
├── index.html          # Professional Glassmorphism UI
├── style.css           # Modern Dark-Mode Aesthetics
└── package.json        # Dependencies & Build metadata
```

---

## 🛠️ Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (LTS recommended)
- A Google Cloud Project with the **Generative Language API** enabled.
- OAuth 2.0 Client ID and Client Secret (Desktop App type).

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/PabloCirre/GeminiBot.git
   cd GeminiBot
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Launch the application:
   ```bash
   npm start
   ```

### Configuration
1. Open the **Settings (Gear Icon)**.
2. Enter your Google Cloud **Client ID** and **Client Secret**.
3. Click **Login with Google**. A browser tab will open for authentication.
4. Once authenticated, select your preferred model (e.g., `gemini-1.5-pro`) and start chatting or creating agents.

---

## 📖 Using Autonomous Agents

To create an autonomous worker:
1. Click the **Agent Icon (🤖)** in the top bar.
2. Provide a **Name** and select a **Schedule** (Cron expression).
3. Select the **Target Folder** the agent should monitor.
4. Write the **Master Instruction** (e.g., "Review all new code for security vulnerabilities and SEO improvements").
5. The agent will now run in the background. You can close the main window; the app stays active in the system tray.

> [!TIP]
> **Pro Tip:** If you want your agent to maintain a complex state, tell it to use the `<AGENT_MEMORY>` tag at the end of its reports. GeminiBot will handle the persistence for you!

---

## 📄 License
GeminiBot is released under the MIT License. Built with ❤️ for the AI automation community.

