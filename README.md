# 🤖 GeminiBot: Professional Autonomous AI Framework

GeminiBot is a desktop application (macOS/Windows) for building and managing **Autonomous AI Agents** powered by the Gemini 2.0 Pro/Flash models. It combines zero-drift persistence, local file system context, and a secure shell action bridge.

---

## ⚡ Key Features

- **Autonomous Proactive Reasoning**: Agents scan their local environment and propose actions (Moltbot pattern).
- **Secure Shell Bridge**: Review and execute terminal commands proposed by your agents.
- **Multimodal Persistence**: Agents maintain memory across sessions using `.agent_memory` files.
- **Skill-Based Plug-and-Play**: Inject specialized logic into any agent via the `/skills` directory or `skills.md`.
- **Professional UI/UX**: High-performance dark glassmorphism interface with SVG iconography.
- **Privacy First**: All tokens, memory, and logs reside locally on your machine.

---

## 🚀 Getting Started

### 1. Download & Install
Check the **[GitHub Releases](https://github.com/PabloCirre/GeminiBot/releases)** for the latest standalone binaries:
- **macOS:** `GeminiBot-1.1.0-arm64.dmg`
- **Windows:** `GeminiBot Setup 1.1.0.exe`

### 2. Configure OAuth 2.0
GeminiBot uses the secure Google Cloud OAuth 2.0 flow. 
- Input your **Client ID** and **Client Secret**.
- Click **"Login with Google"**.
- Your tokens are stored securely in `localStorage`.

---

## 🛠️ Developer Setup (Building from Source)

If you wish to modify or build GeminiBot yourself:

```bash
# Clone the repository
git clone https://github.com/PabloCirre/GeminiBot.git

# Install dependencies
npm install

# Start in developer mode
npm start

# Generate standard binaries
bash scripts/generate_icns.sh
npm run build:mac   # For macOS
npm run build:win   # For Windows
```

---

## 📂 Project Architecture

- `/assets`: Brand icons and UI templates.
- `/skills`: Global or local specialized instructions for bots.
- `main.js`: Electron Main Process (Logic & IPC).
- `renderer.js`: Desktop UI & Agent Engine.
- `oauth.js`: Secure Google Auth loopback server.

---

## 📜 Documentation
- **[DISTRIBUTION.md](DISTRIBUTION.md)**: Full guide for packaging and releases.
- **[usability_analysis.md](usability_analysis.md)**: DX and UI audit results.

---
**Author:** [Pablo Cirre](https://github.com/PabloCirre)  
**License:** [MIT](LICENSE)  
*Professional Agent Framework. Locally Sovereignty. AI Power.*
