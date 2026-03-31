/**
 * GeminiBot Renderer Process
 * Manages the UI state, Chat interactions, and Autonomous Agent orchestration.
 */
const { ipcRenderer, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

// --- UI DOM References ---
const settingsToggle = document.getElementById('settings-toggle');
const agentsToggle = document.getElementById('agents-toggle');
const closeAppBtn = document.getElementById('close-app');
const settingsPanel = document.getElementById('settings-panel');
const agentsPanel = document.getElementById('agents-panel');
const saveSettingsBtn = document.getElementById('save-settings');
const initDemoBtn = document.getElementById('init-demo');

// Auth & Configuration
const clientIdInput = document.getElementById('client-id');
const clientSecretInput = document.getElementById('client-secret');
const oauthLoginBtn = document.getElementById('oauth-login');
const authStatus = document.getElementById('auth-status');
const projectSelect = document.getElementById('project-select');
const modelSelect = document.getElementById('model-select');
const systemPromptInput = document.getElementById('system-prompt');
const selectFolderBtn = document.getElementById('select-folder-btn');
const selectedFolderDisplay = document.getElementById('selected-folder-display');

// Custom Model UI
const customModelSelector = document.getElementById('custom-model-selector');
const modelDropdown = document.getElementById('model-dropdown');
const selectedModelText = document.getElementById('selected-model-text');

// Chat UI
const chatContainer = document.getElementById('chat-container');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');

// Agents Management UI
const agentsList = document.getElementById('agents-list');
const agentNameInput = document.getElementById('agent-name');
const agentGroupInput = document.getElementById('agent-group');
const agentCronSelect = document.getElementById('agent-cron');
const agentFolderBtn = document.getElementById('agent-folder-btn');
const agentFolderDisplay = document.getElementById('agent-folder-display');
const agentFolderPathHidden = document.getElementById('agent-folder-path');
const agentPromptInput = document.getElementById('agent-prompt');
const addAgentBtn = document.getElementById('add-agent-btn');
const editingAgentIdInput = document.getElementById('editing-agent-id');
const cancelEditBtn = document.getElementById('cancel-edit-btn');

// --- Global Application State ---
let accessToken = null;
let chatHistory = [];
let localContextPath = null;
let savedAgents = [];
let activeCronJobs = {}; // Registry of node-cron tasks by agent ID

/**
 * Human-readable labels for cron expressions.
 */
const CRON_LABELS = {
    '* * * * *': 'Every Minute (Test)',
    '0 * * * *': 'Every Hour',
    '0 9 * * *': 'Daily (9:00 AM)',
    '0 3 * * *': 'Nightly (3:00 AM)'
};

/**
 * 1. Initialization Logic
 * Loads persistent settings, identifies OAuth status, and bootstraps agents.
 */
let loadSettings = () => {
    clientIdInput.value = localStorage.getItem('oauth_client_id') || '';
    clientSecretInput.value = localStorage.getItem('oauth_client_secret') || '';
    projectSelect.value = localStorage.getItem('gemini_project') || 'none';
    systemPromptInput.value = localStorage.getItem('gemini_system') || '';
    
    localContextPath = localStorage.getItem('local_context_path') || null;
    if (localContextPath) {
        selectedFolderDisplay.innerText = "Context: " + localContextPath;
    }
    
    const savedModel = localStorage.getItem('gemini_model');
    const refreshToken = localStorage.getItem('oauth_refresh_token');
    
    // Auto-login attempt if refresh token exists
    if (refreshToken && clientIdInput.value && clientSecretInput.value) {
        authStatus.innerText = "Refreshing token...";
        ipcRenderer.invoke('oauth-refresh', clientIdInput.value, clientSecretInput.value, refreshToken)
            .then(res => {
                if (res.success) {
                    accessToken = res.tokens.access_token;
                    authStatus.innerText = "Authenticated ✓";
                    authStatus.style.color = "#4caf50";
                    fetchModels(savedModel);
                } else {
                    authStatus.innerText = "Session expired. Please login again.";
                    authStatus.style.color = "#ff5252";
                }
            });
    }

    try {
        savedAgents = JSON.parse(localStorage.getItem('antigravity_agents') || '[]');
    } catch(e) { savedAgents = []; }
    renderAgents();
    scheduleAllAgents();
};

loadSettings();

// 2. Global Event Listeners
settingsToggle.addEventListener('click', () => {
    agentsPanel.classList.remove('active');
    settingsPanel.classList.toggle('active');
});
agentsToggle.addEventListener('click', () => {
    settingsPanel.classList.remove('active');
    agentsPanel.classList.toggle('active');
});
closeAppBtn.addEventListener('click', () => ipcRenderer.send('quit-app'));

// Folder Selections
selectFolderBtn.addEventListener('click', async () => {
    const folderPath = await ipcRenderer.invoke('open-directory-dialog');
    if (folderPath) {
        localContextPath = folderPath;
        localStorage.setItem('local_context_path', localContextPath);
        selectedFolderDisplay.innerText = "Context: " + folderPath;
    }
});

// Demo Agent Initialization
initDemoBtn.addEventListener('click', () => {
    const existing = savedAgents.find(a => a.name === "UX Auditor");
    if (existing) {
        alert("Demo Agent 'UX Auditor' already exists in your list.");
        return;
    }

    const demoAgent = {
        id: 'agent_demo_' + Date.now(),
        name: "UX Auditor",
        group: "Quality Assurance",
        cron: "0 9 * * *", // Daily 9am
        folder: localContextPath || process.cwd(),
        prompt: "Analyze the current UI files (index.html, style.css, renderer.js) for usability issues and propose shell commands to improve it. Use your specialized USABILITY_FRAMEWORK skill.",
        lastOutput: null
    };

    savedAgents.push(demoAgent);
    localStorage.setItem('antigravity_agents', JSON.stringify(savedAgents));
    renderAgents();
    scheduleAllAgents();
    
    new Notification("Demo Initialized", { body: "'UX Auditor' added to Quality Assurance group." });
});

agentFolderBtn.addEventListener('click', async () => {
    const folderPath = await ipcRenderer.invoke('open-directory-dialog');
    if (folderPath) {
        agentFolderPathHidden.value = folderPath;
        const shortPath = folderPath.length > 30 ? '...' + folderPath.slice(-27) : folderPath;
        agentFolderDisplay.innerText = "Target: " + shortPath;
    }
});

// Custom Model UI Logic
customModelSelector.addEventListener('click', (e) => {
    e.stopPropagation();
    customModelSelector.classList.toggle('open');
    modelDropdown.classList.toggle('hidden');
});
document.addEventListener('click', () => {
    customModelSelector.classList.remove('open');
    modelDropdown.classList.add('hidden');
});

// 3. Dynamic Models Fetching
async function fetchModels(savedModelName) {
    if (!accessToken) return;
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (!response.ok) throw new Error("Failed to load models");
        
        const data = await response.json();
        modelDropdown.innerHTML = '';
        
        let hasSavedModel = false;
        let proModelFallback = null;
        let firstModelFallback = null;
        
        data.models.forEach(m => {
            if (!m.supportedGenerationMethods.includes("generateContent")) return;
            const cleanName = m.name.replace('models/', '');
            if (!firstModelFallback) firstModelFallback = cleanName;
            
            const card = document.createElement('div');
            card.className = 'model-card';
            
            let displayName = m.displayName || cleanName;
            let icon = '';
            let desc = 'General purpose AI model.';

            if (cleanName.includes('pro')) {
                card.classList.add('pro-model');
                icon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; color: #D4AF37;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>';
                desc = 'Complex reasoning. Perfect for multi-file code audits.';
                if (!proModelFallback) proModelFallback = cleanName;
            } else if (cleanName.includes('flash')) {
                card.classList.add('flash-model');
                icon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; color: #00BFFF;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>';
                desc = 'Lightning fast responses for quick queries.';
            }

            card.innerHTML = `
                <div class="model-card-title">${icon} ${displayName}</div>
                <div class="model-card-desc">${desc}</div>
            `;
            
            card.addEventListener('click', (e) => {
                e.stopPropagation();
                modelSelect.value = cleanName;
                selectedModelText.innerText = `${icon} ${displayName}`;
                customModelSelector.classList.remove('open');
                modelDropdown.classList.add('hidden');
                localStorage.setItem('gemini_model', cleanName);
            });
            
            if (cleanName === savedModelName) {
                hasSavedModel = true;
                selectedModelText.innerText = `${icon} ${displayName}`;
            }
            modelDropdown.appendChild(card);
        });

        if (hasSavedModel) {
            modelSelect.value = savedModelName;
        } else if (proModelFallback || firstModelFallback) {
            const fallback = proModelFallback || firstModelFallback;
            modelSelect.value = fallback;
            selectedModelText.innerText = fallback;
        }
    } catch (err) {
        console.error("Models fetch error:", err);
        selectedModelText.innerText = 'Error loading models';
    }
}

// Auth Login
oauthLoginBtn.addEventListener('click', async () => {
    const id = clientIdInput.value.trim();
    const secret = clientSecretInput.value.trim();
    if (!id || !secret) { alert("Please enter Client ID and Client Secret first."); return; }
    
    localStorage.setItem('oauth_client_id', id);
    localStorage.setItem('oauth_client_secret', secret);
    oauthLoginBtn.innerText = "Logging in...";
    authStatus.innerText = "Waiting for browser...";
    
    const res = await ipcRenderer.invoke('oauth-login', id, secret);
    if (res.success) {
        accessToken = res.tokens.access_token;
        if (res.tokens.refresh_token) localStorage.setItem('oauth_refresh_token', res.tokens.refresh_token);
        authStatus.innerText = "Authenticated ✓";
        authStatus.style.color = "#4caf50";
        fetchModels();
    } else {
        authStatus.innerText = "Login failed: " + res.error;
        authStatus.style.color = "#ff5252";
    }
    oauthLoginBtn.innerText = "Login with Google";
});

saveSettingsBtn.addEventListener('click', () => {
    localStorage.setItem('gemini_project', projectSelect.value);
    if (modelSelect.value) localStorage.setItem('gemini_model', modelSelect.value);
    localStorage.setItem('gemini_system', systemPromptInput.value.trim());
    settingsPanel.classList.remove('active');
});

/**
 * 4. File System Scraper
 * Recursively reads codebase context for LLM injection.
 * @param {string} dirPath - Folder to analyze.
 * @param {string[]} allowedExtensions - Filter for code files.
 * @returns {string} - Aggregated text content of files.
 */
function readContextFolder(dirPath, allowedExtensions = ['.js', '.py', '.php', '.html', '.css', '.md', '.json', '.txt']) {
    let result = '';
    const ignoreDirs = ['node_modules', '.git', 'vendor', '__pycache__', 'dist', 'build', 'artifacts'];
    try {
        const files = fs.readdirSync(dirPath);
        for (const file of files) {
            const fullPath = path.join(dirPath, file);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                if (!ignoreDirs.includes(file)) {
                    result += readContextFolder(fullPath, allowedExtensions);
                }
            } else if (stat.isFile()) {
                const ext = path.extname(file).toLowerCase();
                if (allowedExtensions.includes(ext) || file.startsWith('.')) {
                    if (stat.size < 1000 * 1024) {  // < 1MB limit per file
                        try {
                            const content = fs.readFileSync(fullPath, 'utf8');
                            result += `\n--- File: ${fullPath} ---\n${content}\n`;
                        } catch (e) { console.warn("Could not read", fullPath); }
                    }
                }
            }
        }
    } catch (e) {
        console.error("Error reading directory", dirPath, e);
    }
    return result;
}

// 5. Chat Engine
chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = (chatInput.scrollHeight) + 'px';
});
chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
sendBtn.addEventListener('click', () => { sendMessage(); });

function appendMessage(role, text) {
    if (document.getElementById('welcome-message')) document.getElementById('welcome-message').remove();
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;
    let formattedText = text.replace(/```([\s\S]*?)```/gs, '<pre><code>$1</code></pre>');
    formattedText = formattedText.replace(/`([^`]+)`/g, '<code>$1</code>');
    formattedText = formattedText.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    formattedText = formattedText.replace(/\n\n/g, '<br><br>');
    msgDiv.innerHTML = role === 'bot' ? formattedText : text;
    chatContainer.appendChild(msgDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

/**
 * 5. Messaging Controller
 * Handles the user chat input, injects local context if available,
 * and communicates with the Gemini API.
 */
async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;
    if (!accessToken) { alert("Please Login with Google first."); return; }

    appendMessage('user', text);
    chatHistory.push({ role: 'user', parts: [{ text: text }] });
    chatInput.value = '';
    chatInput.style.height = '20px';

    const selectedModel = modelSelect.value || 'gemini-1.5-pro';
    let sysPrompt = systemPromptInput.value.trim();
    
    appendMessage('bot', `<i style="color: grey;" id="loading-msg">Connecting to Gemini...</i>`);
    
    if (localContextPath) {
        document.getElementById('loading-msg').innerText = "Reading local files context...";
        const fileData = readContextFolder(localContextPath);
        if (fileData) {
            sysPrompt += "\n\n# LOCAL PROJECT CONTEXT:\n" + fileData;
        }
        document.getElementById('loading-msg').innerText = "Thinking...";
    }

    try {
        const payload = {
            contents: chatHistory,
            systemInstruction: sysPrompt ? { parts: [{ text: sysPrompt }] } : undefined
        };

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
            body: JSON.stringify(payload)
        });

        const loadingE = document.getElementById('loading-msg');
        if (loadingE) loadingE.parentElement.remove();

        if (!response.ok) throw new Error(await response.text());

        const data = await response.json();
        const botText = data.candidates?.[0]?.content?.parts?.[0]?.text || "[No response]";
        
        appendMessage('bot', botText);
        chatHistory.push({ role: 'model', parts: [{ text: botText }] });
    } catch (error) {
        console.error(error);
        const loadingE = document.getElementById('loading-msg');
        if (loadingE) loadingE.parentElement.remove();
        appendMessage('bot', `**Error**: \n\`\`\`\n${error.message}\n\`\`\``);
    }
}

// 6. Agents (Cron) Subsystem
function resetAgentForm() {
    agentNameInput.value = '';
    agentGroupInput.value = '';
    agentPromptInput.value = '';
    agentFolderPathHidden.value = '';
    agentFolderDisplay.innerText = '';
    editingAgentIdInput.value = '';
    addAgentBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></svg> Create Agent';
    cancelEditBtn.style.display = 'none';
}

cancelEditBtn.addEventListener('click', resetAgentForm);

addAgentBtn.addEventListener('click', () => {
    const name = agentNameInput.value.trim();
    const group = agentGroupInput.value.trim() || 'General';
    const cronExp = agentCronSelect.value;
    const folder = agentFolderPathHidden.value;
    const prompt = agentPromptInput.value.trim();
    const editingId = editingAgentIdInput.value;

    if (!name || !folder || !prompt) {
        alert("Name, Folder and Prompt are required to save an agent.");
        return;
    }

    if (editingId) {
        const idx = savedAgents.findIndex(a => a.id === editingId);
        if (idx > -1) {
            savedAgents[idx].name = name;
            savedAgents[idx].group = group;
            savedAgents[idx].cron = cronExp;
            savedAgents[idx].folder = folder;
            savedAgents[idx].prompt = prompt;
        }
    } else {
        const agent = {
            id: 'agent_' + Date.now(),
            name: name,
            group: group,
            cron: cronExp,
            folder: folder,
            prompt: prompt,
            lastOutput: null
        };
        savedAgents.push(agent);
    }

    localStorage.setItem('antigravity_agents', JSON.stringify(savedAgents));
    resetAgentForm();
    renderAgents();
    scheduleAllAgents();
});

function renderAgents() {
    agentsList.innerHTML = '';
    if (savedAgents.length === 0) {
        agentsList.innerHTML = '<div style="color: var(--text-secondary); text-align: center; font-size: 12px; padding: 10px;">No active agents.</div>';
        return;
    }

    // Group agents by their 'group' field
    const grouped = savedAgents.reduce((acc, agent) => {
        const key = agent.group || 'General';
        if (!acc[key]) acc[key] = [];
        acc[key].push(agent);
        return acc;
    }, {});

    Object.keys(grouped).sort().forEach(groupName => {
        // Group Header (Folder)
        const groupHeader = document.createElement('div');
        groupHeader.className = 'agent-group-header';
        groupHeader.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
            ${groupName}
        `;
        agentsList.appendChild(groupHeader);

        grouped[groupName].forEach(agent => {
            const card = document.createElement('div');
            card.className = 'agent-card';
            const friendlyCron = CRON_LABELS[agent.cron] || agent.cron;
            
            // Pending Command UI (OpenClaw pattern)
            let commandHtml = '';
            if (agent.pendingCommand) {
                commandHtml = `
                <div class="command-box">
                    <div class="command-header">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>
                        Proposed Command
                    </div>
                    <code class="command-text">${agent.pendingCommand}</code>
                    <button class="agent-btn run-cmd-btn" data-id="${agent.id}" style="width: 100%; margin-top: 8px; background: var(--accent); color: #000; font-weight: 700;">
                        Execute Command
                    </button>
                    <div class="command-output" id="output-${agent.id}" style="display:none;"></div>
                </div>`;
            }

            // Skill Detection Visual Badge
            let skillsBadge = '';
            const skillsPath = path.join(agent.folder, 'skills.md');
            const skillsDir = path.join(agent.folder, 'skills');
            if (fs.existsSync(skillsPath) || fs.existsSync(skillsDir)) {
                skillsBadge = '<span class="skill-badge" title="Specialized Skills Active">⚡ Skills</span>';
            }

            let viewOutputHtml = '';
            if (agent.lastOutput) {
                viewOutputHtml = `
                    <button class="agent-btn view view-btn" data-id="${agent.id}">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                        View Report
                    </button>`;
            }
            
            card.innerHTML = `
                <div class="agent-header">
                    <span class="agent-name"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle;"><rect x="3" y="11" width="18" height="10" rx="2"></rect><circle cx="12" cy="5" r="2"></circle><path d="M12 7v4"></path><line x1="8" y1="16" x2="8" y2="16"></line><line x1="16" y1="16" x2="16" y2="16"></line></svg>${agent.name}</span>
                    <span class="agent-cron">${friendlyCron}</span>
                </div>
                <div class="agent-folder" style="display:flex; justify-content: space-between;">
                    <span>Folder: ...${agent.folder.slice(-20)}</span>
                    ${skillsBadge}
                </div>
                ${commandHtml}
                <div class="agent-actions" style="margin-top: 10px; border-top: 1px solid var(--border); padding-top: 8px;">
                    ${viewOutputHtml}
                    <button class="agent-btn run run-btn" data-id="${agent.id}" id="run-btn-${agent.id}">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                        Run
                    </button>
                    <button class="agent-btn edit edit-btn" data-id="${agent.id}">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        Edit
                    </button>
                    <button class="agent-btn danger del-btn" data-id="${agent.id}">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        Delete
                    </button>
                </div>
            `;
            agentsList.appendChild(card);
        });
    });

    // Event Delegation for action buttons
    agentsList.addEventListener('click', async (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const id = btn.getAttribute('data-id');
        const agent = savedAgents.find(a => a.id === id);

        if (btn.classList.contains('del-btn')) {
            savedAgents = savedAgents.filter(a => a.id !== id);
            localStorage.setItem('antigravity_agents', JSON.stringify(savedAgents));
            renderAgents();
            scheduleAllAgents();
        } else if (btn.classList.contains('edit-btn')) {
            if (agent) {
                agentNameInput.value = agent.name;
                agentGroupInput.value = agent.group || 'General';
                agentCronSelect.value = agent.cron;
                agentFolderPathHidden.value = agent.folder;
                agentFolderDisplay.innerText = "Target: ..." + agent.folder.slice(-25);
                agentPromptInput.value = agent.prompt;
                editingAgentIdInput.value = agent.id;
                addAgentBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg> Update Agent';
                cancelEditBtn.style.display = 'block';
            }
        } else if (btn.classList.contains('run-btn')) {
            if (agent) executeAgentJob(agent);
        } else if (btn.classList.contains('view-btn')) {
            if (agent && agent.lastOutput) {
                shell.openPath(agent.lastOutput);
            }
        } else if (btn.classList.contains('run-cmd-btn')) {
            if (agent && agent.pendingCommand) {
                const outputEl = document.getElementById(`output-${agent.id}`);
                btn.disabled = true;
                btn.innerText = "Executing...";
                outputEl.style.display = 'block';
                outputEl.innerText = "Running command...";
                
                const result = await ipcRenderer.invoke('exec-command', agent.pendingCommand, agent.folder);
                
                if (result.success) {
                    outputEl.style.color = "#4caf50";
                    outputEl.innerText = result.stdout || "Success (no output)";
                    agent.pendingCommand = null; // Clear on success
                    localStorage.setItem('antigravity_agents', JSON.stringify(savedAgents));
                    setTimeout(() => renderAgents(), 3000);
                } else {
                    outputEl.style.color = "#ff5252";
                    outputEl.innerText = result.stderr || result.error;
                    btn.disabled = false;
                    btn.innerText = "Execute Command";
                }
            }
        }
    });
}

/**
 * 6. Autonomous Agents Engine
 * Manages the background lifecycle of Cron-scheduled tasks.
 */
function scheduleAllAgents() {
    // 1. Destroy existing jobs
    for (const id in activeCronJobs) {
        activeCronJobs[id].stop();
    }
    activeCronJobs = {};

    // 2. Schedule new jobs
    savedAgents.forEach(agent => {
        if (cron.validate(agent.cron)) {
            const task = cron.schedule(agent.cron, () => {
                console.log(`[Agents] Firing scheduled agent: ${agent.name}`);
                executeAgentJob(agent);
            });
            activeCronJobs[agent.id] = task;
        } else {
            console.error(`Invalid cron expression for agent ${agent.name}: ${agent.cron}`);
        }
    });
    console.log(`[Agents] Scheduled ${Object.keys(activeCronJobs).length} active jobs.`);
}

/**
 * Core Agent Execution Lifecycle
 * 1. Read persistent memory from disk.
 * 2. Scrape target folder context.
 * 3. Instruct Gemini to update its state.
 * 4. Persist new memory and generate Markdown report.
 * @param {Object} agent - The agent configuration object.
 */
async function executeAgentJob(agent) {
    if (!accessToken) {
        new Notification("GeminiBot Agent Failed", { body: `Agent '${agent.name}' failed to run: You are not logged in.`});
        return;
    }

    const runBtn = document.getElementById(`run-btn-${agent.id}`);
    if (runBtn) {
        runBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spin" style="margin-right: 4px;"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg> Thinking...';
        runBtn.disabled = true;
    }

    console.log(`[Agents] Executing job for ${agent.name} targeting ${agent.folder}`);
    new Notification("GeminiBot Agent Running", { body: `Agent '${agent.name}' has woken up and is processing files...`});
    
    try {
        const memoryPath = path.join(agent.folder, `.agent_memory_${agent.id}.txt`);
        let memoryContent = '';
        if (fs.existsSync(memoryPath)) {
            try { memoryContent = fs.readFileSync(memoryPath, 'utf8'); } catch(e){}
        }

        const contextData = readContextFolder(agent.folder);
        let sysPrompt = agent.prompt;

        // --- ENVIRONMENT HEARTBEAT (Moltbot pattern) ---
        const envInfo = `
# ENVIRONMENT CONTEXT:
- Operating System: ${process.platform} (${process.arch})
- Current Time: ${new Date().toLocaleString()}
- Working Directory: ${agent.folder}
- Shell Environment: ${process.platform === 'win32' ? 'PowerShell/CMD' : 'zsh/bash'}
`;
        sysPrompt = envInfo + "\n" + sysPrompt;
        
        // --- SKILLS DETECTION ---
        const skillsPath = path.join(agent.folder, 'skills.md');
        const skillsDir = path.join(agent.folder, 'skills');
        let skillsContent = '';

        if (fs.existsSync(skillsPath)) {
            skillsContent += `\n# SKILL: DOCUMENTED INSTRUCTIONS\n${fs.readFileSync(skillsPath, 'utf8')}\n`;
        }
        if (fs.existsSync(skillsDir)) {
            const skillFiles = fs.readdirSync(skillsDir).filter(f => f.endsWith('.md'));
            skillFiles.forEach(sf => {
                const sfContent = fs.readFileSync(path.join(skillsDir, sf), 'utf8');
                skillsContent += `\n# SKILL: ${sf.toUpperCase()}\n${sfContent}\n`;
            });
        }
        if (skillsContent) {
            sysPrompt += "\n\n# AGENT SPECIALIZED SKILLS (YOU MUST FOLLOW THESE RULES):\n" + skillsContent;
        }

        if (memoryContent) {
            sysPrompt += "\n\n# TU MEMORIA DE LA SESIÓN ANTERIOR (RETOMA DESDE AQUÍ):\n" + memoryContent;
        }

        if (contextData) {
            sysPrompt += "\n\n# TARGET PROJECT FILES FOR YOU TO ANALYZE:\n" + contextData;
        }

        // Strict Memory Constraint
        sysPrompt += "\n\n# MANDATORY MEMORY INSTRUCTION:\nAt the end of your response, you MUST include a block wrapping your progress for your future self, using exactly these HTML tags:\n<AGENT_MEMORY>\n(Write here your state, what you have done and what you should do next time you wake up)\n</AGENT_MEMORY>\nThis is vital for maintaining your continuity.\n\n# AUTONOMOUS SHELL INSTRUCTION:\nIf you need to execute a command to advance your task (like 'git commit', 'npm test', etc.), wrap exactly ONE command in <SHELL> tags like this:\n<SHELL>npm test</SHELL>\nThe user will review and execute it from the dashboard.";

        const payload = {
            contents: [{ role: 'user', parts: [{ text: "Wake up. Review your system instructions, environment, memory, and local code, and fulfill your task." }] }],
            systemInstruction: { text: sysPrompt }
        };

        const currentModel = localStorage.getItem('gemini_model') || 'gemini-1.5-pro';

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(await response.text());

        const data = await response.json();
        const outputText = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (outputText) {
            let cleanOutput = outputText;
            const memoryMatch = outputText.match(/<AGENT_MEMORY>([\s\S]*?)<\/AGENT_MEMORY>/i);
            const shellMatch = outputText.match(/<SHELL>([\s\S]*?)<\/SHELL>/i);

            if (memoryMatch && memoryMatch[1]) {
                fs.writeFileSync(memoryPath, memoryMatch[1].trim());
                cleanOutput = outputText.replace(/<AGENT_MEMORY>[\s\S]*?<\/AGENT_MEMORY>/i, '').trim();
            }

            if (shellMatch && shellMatch[1]) {
                agent.pendingCommand = shellMatch[1].trim();
                cleanOutput = cleanOutput.replace(/<SHELL>[\s\S]*?<\/SHELL>/i, '').trim();
            } else {
                agent.pendingCommand = null;
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const fileName = `AgentReport_${agent.name.replace(/\s+/g, '_')}_${timestamp}.md`;
            const outPath = path.join(agent.folder, fileName);
            fs.writeFileSync(outPath, `# 🤖 Agent Report: ${agent.name}\n**Time:** ${new Date().toLocaleString()}\n**Instruction:** ${agent.prompt}\n\n---\n\n${cleanOutput}`);
            
            // Save state
            agent.lastOutput = outPath;
            localStorage.setItem('antigravity_agents', JSON.stringify(savedAgents));
            renderAgents();
            
            new Notification("GeminiBot Agent Completed", { body: `Report: ${fileName} ${shellMatch ? '(Action Required)' : ''}`});
        }
    } catch (error) {
        console.error(`Agent ${agent.name} Error:`, error);
        new Notification(`GeminiBot Agent Error`, { body: `Agent '${agent.name}' encountered an error: ${error.message}`});
        
        if (runBtn) {
            runBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Run';
            runBtn.disabled = false;
        }
    }
}
